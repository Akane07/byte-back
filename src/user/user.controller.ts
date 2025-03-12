import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@Request() req: any) {
    return this.userService.getUser(req.user.userId);
  }

  @Get(':id')
  getUser(@Param() params: { id: string }) {
    return this.userService.getUser(params.id);
  }
}
