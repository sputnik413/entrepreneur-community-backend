import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../user/entities/user.entity';
import { UsersService } from '../user/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { VerificationPurpose } from '../../verification/verification-purpose.enum';
import { VerificationService } from '../../verification/verification.service';

const PASSWORD_HASH_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly verificationService: VerificationService,
  ) {}

  async requestRegistrationVerification(
    email: string,
  ): Promise<{ verificationId: string; expiresInSeconds: number }> {
    const existingUser = await this.usersService.findByEmail(email);

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    return this.verificationService.requestEmailCode(
      email,
      VerificationPurpose.Register,
    );
  }

  async register(registerDto: RegisterDto): Promise<{ accessToken: string }> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    await this.verificationService.consumeEmailCode({
      verificationId: registerDto.verificationId,
      code: registerDto.verificationCode,
      destination: registerDto.email,
      purpose: VerificationPurpose.Register,
    });

    const passwordHash = await bcrypt.hash(
      registerDto.password,
      PASSWORD_HASH_ROUNDS,
    );
    const user = await this.usersService.create(
      registerDto.email,
      passwordHash,
      new Date(),
    );

    return this.issueAccessToken(user);
  }

  async login(loginDto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.usersService.findByEmailWithPassword(
      loginDto.email,
    );

    if (
      !user ||
      !(await bcrypt.compare(loginDto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueAccessToken(user);
  }

  private async issueAccessToken(user: User): Promise<{ accessToken: string }> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = await this.jwtService.signAsync(payload);

    return { accessToken };
  }
}
