import { Injectable, OnModuleInit, Logger } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';
import { hashPassword } from '../auth/password.util';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    // =====================================================
    // SEED DESACTIVADO POR DEFECTO
    // =====================================================

    const enabled = this.configService.get<string>('SEED_ADMIN_ENABLED');

    if (enabled !== 'true') {
      return;
    }

    // =====================================================
    // VALIDAR SI YA EXISTE UN ADMINISTRADOR
    // =====================================================

    const existingAdmin = await this.userRepo.findOne({
      where: {
        role: UserRole.ADMIN,
      },
    });

    if (existingAdmin) {
      this.logger.log('Administrador ya existe');
      return;
    }

    // =====================================================
    // RECUPERAR CREDENCIALES DESDE VARIABLES DE ENTORNO
    // =====================================================

    const email = this.configService.get<string>('SEED_ADMIN_EMAIL');

    const password = this.configService.get<string>('SEED_ADMIN_PASSWORD');

    if (!email || !password || password.length < 12) {
      throw new Error('Configuración de administrador inicial inválida');
    }

    const passwordHash = await hashPassword(password);

    const admin = this.userRepo.create({
      email,
      password: passwordHash,
      role: UserRole.ADMIN,
      active: true,
    });

    await this.userRepo.save(admin);

    this.logger.log('Administrador inicial creado correctamente');
  }
}
