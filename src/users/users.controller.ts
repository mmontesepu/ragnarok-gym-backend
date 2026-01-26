import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserRole } from './user-role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(
    @Body()
    body: {
      email: string;
      password: string;
      role: UserRole;
    },
  ) {
    return this.usersService.create(
      body.email,
      body.password,
      body.role,
    );
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('active')
  findActive() {
    return this.usersService.findActive();
  }

  @Patch(':id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.usersService.deactivate(Number(id));
  }
}
