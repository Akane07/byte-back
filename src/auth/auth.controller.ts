import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.registerUser(createUserDto);
  }
  @Post('login')
  async login(@Body() createUserDto: { email: string; password: string }) {
    return this.authService.loginUser(createUserDto.email, createUserDto.password);
  }
}
