import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestRegistrationVerificationDto } from './dto/request-registration-verification.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() registerDto: RegisterDto): Promise<{ accessToken: string }> {
    return this.authService.register(registerDto);
  }

  @HttpCode(HttpStatus.ACCEPTED)
  @Post('register/verification')
  requestRegistrationVerification(
    @Body() requestDto: RequestRegistrationVerificationDto,
  ): Promise<{ verificationId: string; expiresInSeconds: number }> {
    return this.authService.requestRegistrationVerification(requestDto.email);
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto): Promise<{ accessToken: string }> {
    return this.authService.login(loginDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
