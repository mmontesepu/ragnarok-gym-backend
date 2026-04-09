import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

@Injectable()
export class SeedService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    const email = 'admin@gym.cl';

    const existing = await this.userRepo.findOne({
      where: { email },
    });

    if (existing) {
      console.log('✅ Admin ya existe');
      return;
    }

    const admin = this.userRepo.create({
      email,
      password: '123456', // ⚠️ luego puedes hashearlo si usas bcrypt
      role: UserRole.ADMIN,
      active: true,
    });

    await this.userRepo.save(admin);

    console.log('🔥 Admin creado: admin@gym.cl / Admin123');
  }
}
