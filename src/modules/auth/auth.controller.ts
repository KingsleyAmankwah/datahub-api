import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, CreateAdminDto, LoginDto } from './auth.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login — returns JWT access token' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('admin')
  @ApiOperation({ summary: 'Create admin user' })
  @ApiResponse({ status: 201, description: 'Admin created' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  createAdmin(@Body() dto: CreateAdminDto) {
    return this.authService.createAdmin(dto);
  }
}
