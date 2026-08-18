import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsUUID()
  verificationId!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  verificationCode!: string;
}
