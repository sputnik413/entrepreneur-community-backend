import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter | null;
  private readonly from: string | null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const username = this.configService.get<string>('SMTP_USERNAME');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    this.from = this.configService.get<string>('SMTP_FROM') ?? null;

    this.transporter =
      host && username && password && this.from
        ? nodemailer.createTransport({
            host,
            port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
            secure: this.configService.get<string>('SMTP_SECURE') === 'true',
            auth: { user: username, pass: password },
          })
        : null;
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    if (!this.transporter || !this.from) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Your verification code',
      text: `Your verification code is ${code}. It expires in 5 minutes.`,
    });
  }
}
