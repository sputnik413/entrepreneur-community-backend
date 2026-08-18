import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EmailService } from './email.service';
import { REDIS_CLIENT } from './verification.constants';
import { VerificationService } from './verification.service';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis =>
        new Redis(configService.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: true,
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          connectTimeout: 5000,
        }),
    },
    EmailService,
    VerificationService,
  ],
  exports: [VerificationService],
})
export class VerificationModule {}
