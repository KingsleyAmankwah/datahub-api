import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AgentLoginDto {
  @ApiProperty({ example: '0241234567' })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, { message: 'Invalid Ghana phone number' })
  phoneNumber: string;

  @ApiProperty({ minLength: 4 })
  @IsString()
  @MinLength(4)
  pin: string;

  constructor(phoneNumber: string, pin: string) {
    this.phoneNumber = phoneNumber;
    this.pin = pin;
  }
}

export class LoginDto {
  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
  }
}

export class CreateAdminDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'admin@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  constructor(name: string, email: string, password: string) {
    this.name = name;
    this.email = email;
    this.password = password;
  }
}
