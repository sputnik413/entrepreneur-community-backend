import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { EmailService } from './email.service';
import { REDIS_CLIENT } from './verification.constants';
import { VerificationPurpose } from './verification-purpose.enum';

const MAX_VERIFICATION_ATTEMPTS = 5;
const VERIFY_CODE_SCRIPT = `
  local raw = redis.call('GET', KEYS[1])
  if not raw then return { -1 } end

  local record = cjson.decode(raw)
  if record.codeHash ~= ARGV[1] then
    record.attempts = record.attempts + 1
    if record.attempts >= tonumber(ARGV[2]) then
      redis.call('DEL', KEYS[1])
    else
      redis.call('SET', KEYS[1], cjson.encode(record), 'KEEPTTL')
    end
    return { 0, record.attempts }
  end

  redis.call('DEL', KEYS[1])
  return { 1, record.destination, record.purpose }
`;

interface VerificationRecord {
  destination: string;
  purpose: VerificationPurpose;
  codeHash: string;
  attempts: number;
}

interface ConsumeEmailCodeInput {
  verificationId: string;
  code: string;
  destination: string;
  purpose: VerificationPurpose;
}

@Injectable()
export class VerificationService implements OnApplicationShutdown {
  private readonly codeSecret: string;
  private readonly codeTtlSeconds = 300;
  private readonly resendCooldownSeconds = 60;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.codeSecret = this.configService.getOrThrow<string>(
      'VERIFICATION_CODE_SECRET',
    );
  }

  async requestEmailCode(
    destination: string,
    purpose: VerificationPurpose,
  ): Promise<{ verificationId: string; expiresInSeconds: number }> {
    const cooldownKey = this.cooldownKey(destination, purpose);
    let cooldownCreated: string | null;

    try {
      cooldownCreated = await this.redis.set(
        cooldownKey,
        '1',
        'EX',
        this.resendCooldownSeconds,
        'NX',
      );
    } catch {
      throw new ServiceUnavailableException(
        'Verification storage is unavailable',
      );
    }

    if (!cooldownCreated) {
      throw new HttpException(
        'Please wait before requesting another verification code',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const verificationId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const record: VerificationRecord = {
      destination,
      purpose,
      codeHash: this.hash(`${verificationId}:${code}`),
      attempts: 0,
    };

    try {
      await this.redis.set(
        this.verificationKey(verificationId),
        JSON.stringify(record),
        'EX',
        this.codeTtlSeconds,
      );
      await this.emailService.sendVerificationCode(destination, code);
    } catch (error) {
      await this.redis.del(this.verificationKey(verificationId), cooldownKey);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Unable to send the verification code',
      );
    }

    return { verificationId, expiresInSeconds: this.codeTtlSeconds };
  }

  async consumeEmailCode(input: ConsumeEmailCodeInput): Promise<void> {
    let result: [number, string?, VerificationPurpose?];

    try {
      result = (await this.redis.eval(
        VERIFY_CODE_SCRIPT,
        1,
        this.verificationKey(input.verificationId),
        this.hash(`${input.verificationId}:${input.code}`),
        MAX_VERIFICATION_ATTEMPTS,
      )) as [number, string?, VerificationPurpose?];
    } catch {
      throw new ServiceUnavailableException(
        'Verification storage is unavailable',
      );
    }

    const [status, destination, purpose] = result;

    if (
      status === 1 &&
      destination === input.destination &&
      purpose === input.purpose
    ) {
      return;
    }

    throw new HttpException(
      'Verification code is invalid or expired',
      HttpStatus.BAD_REQUEST,
    );
  }

  onApplicationShutdown(): void {
    this.redis.disconnect();
  }

  private hash(value: string): string {
    return createHmac('sha256', this.codeSecret).update(value).digest('hex');
  }

  private verificationKey(verificationId: string): string {
    return `verification:email:${verificationId}`;
  }

  private cooldownKey(
    destination: string,
    purpose: VerificationPurpose,
  ): string {
    return `verification:cooldown:${purpose}:${this.hash(destination)}`;
  }
}
