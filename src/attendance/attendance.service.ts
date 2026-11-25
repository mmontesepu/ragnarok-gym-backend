import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';

import { randomUUID } from 'crypto';

import { AttendanceToken } from './attendance.entity';

import { Booking, BookingStatus } from '../bookings/booking.entity';

import {
  FreeSchedule,
  FreeScheduleStatus,
} from '../free-schedules/free-schedule.entity';

import { Student } from '../students/student.entity';
import { User } from '../users/user.entity';
import { UserRole } from '../users/user-role.enum';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceToken)
    private readonly tokenRepo: Repository<AttendanceToken>,

    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,

    @InjectRepository(FreeSchedule)
    private readonly freeRepo: Repository<FreeSchedule>,

    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,

    private readonly dataSource: DataSource,
  ) {}

  // =====================================================
  // FECHA ACTUAL EN CHILE
  // =====================================================

  private getTodayChile(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((p) => p.type === 'year')?.value;

    const month = parts.find((p) => p.type === 'month')?.value;

    const day = parts.find((p) => p.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }

  // =====================================================
  // VALIDAR ALUMNO ACTIVO
  // =====================================================

  private validateActiveStudent(student: Student) {
    if (!student || !student.active || !student.user || !student.user.active) {
      throw new BadRequestException('Alumno inactivo o cuenta bloqueada');
    }
  }

  // =====================================================
  // VALIDAR PROPIETARIO DE LA RESERVA
  // =====================================================

  private validateOwner(student: Student, userId: number) {
    this.validateActiveStudent(student);

    if (student.user.id !== userId) {
      throw new ForbiddenException('La reserva no pertenece al usuario');
    }
  }

  // =====================================================
  // GENERAR QR UUID - RESERVA CON PROFESOR
  // COMPATIBILIDAD CON VERSIONES ANTERIORES
  // =====================================================

  async generateForBooking(bookingId: number, date: string, userId: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: ['student', 'student.user'],
    });

    if (!booking) {
      throw new BadRequestException('Reserva no encontrada');
    }

    this.validateOwner(booking.student, userId);

    if (booking.date !== date) {
      throw new BadRequestException('Fecha de reserva incorrecta');
    }

    if (booking.status !== BookingStatus.BOOKED) {
      throw new BadRequestException('La reserva ya no está disponible');
    }

    return this.createToken('BOOKING', bookingId, date);
  }

  // =====================================================
  // GENERAR QR UUID - PLAN LIBRE
  // COMPATIBILIDAD CON VERSIONES ANTERIORES
  // =====================================================

  async generateForFree(freeId: number, date: string, userId: number) {
    const free = await this.freeRepo.findOne({
      where: { id: freeId },
      relations: ['student', 'student.user'],
    });

    if (!free) {
      throw new BadRequestException('Reserva libre no encontrada');
    }

    this.validateOwner(free.student, userId);

    if (free.date !== date) {
      throw new BadRequestException('Fecha de reserva incorrecta');
    }

    if (free.status !== FreeScheduleStatus.BOOKED) {
      throw new BadRequestException('La reserva ya no está disponible');
    }

    return this.createToken('FREE', freeId, date);
  }

  // =====================================================
  // CREAR TOKEN UUID
  // =====================================================

  private async createToken(
    type: 'BOOKING' | 'FREE',
    refId: number,
    date: string,
  ) {
    const token = randomUUID();

    const record = this.tokenRepo.create({
      referenceType: type,
      referenceId: refId,
      date,
      token,
      used: false,
      createdAt: new Date(),
    });

    await this.tokenRepo.save(record);

    return { token };
  }

  // =====================================================
  // NORMALIZAR CONTENIDO DEL QR
  // =====================================================

  private normalizeQr(raw: unknown): string {
    let token: string;

    if (typeof raw === 'string') {
      token = raw;
    } else if (
      raw &&
      typeof raw === 'object' &&
      'token' in raw &&
      typeof raw.token === 'string'
    ) {
      token = raw.token;
    } else {
      throw new BadRequestException('Formato QR inválido');
    }

    token = token
      .trim()
      .replace(/^\{\s*"?token"?\s*:\s*"?/, '')
      .replace(/"?\s*\}$/, '')
      .replace(/^"|"$/g, '')
      .trim();

    if (!token || token.length > 100) {
      throw new BadRequestException('Formato QR inválido');
    }

    return token;
  }

  // =====================================================
  // VALIDACIÓN PRINCIPAL
  // DETECTAR RUT O UUID
  // =====================================================

  async validate(
    raw: unknown,
    validatorUserId: number,
    validatorRole: UserRole,
  ) {
    const token = this.normalizeQr(raw);

    if (
      validatorRole !== UserRole.ADMIN &&
      validatorRole !== UserRole.TEACHER
    ) {
      throw new ForbiddenException('Usuario no autorizado');
    }

    const validator = await this.dataSource.getRepository(User).findOne({
      where: { id: validatorUserId },
    });

    if (!validator || !validator.active || validator.role !== validatorRole) {
      throw new ForbiddenException('Usuario no autorizado');
    }

    // NUEVO: QR CON RUT NUMÉRICO
    if (/^[1-9][0-9]{0,7}$/.test(token)) {
      return this.validateRut(token, validatorUserId, validatorRole);
    }

    // QR ANTIGUO: UUID
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        token,
      )
    ) {
      return this.validateLegacyToken(token, validatorUserId, validatorRole);
    }

    throw new BadRequestException('Formato QR inválido');
  }

  // =====================================================
  // NUEVO: VALIDAR QR MEDIANTE RUT
  // =====================================================

  private async validateRut(
    rut: string,
    validatorUserId: number,
    validatorRole: UserRole,
  ) {
    const today = this.getTodayChile();

    return this.dataSource.transaction(async (manager) => {
      // 1. Buscar alumno por cuerpo numérico del RUT
      const student = await manager
        .getRepository(Student)
        .createQueryBuilder('student')
        .leftJoinAndSelect('student.user', 'user')
        .where("SPLIT_PART(student.rut, '-', 1) = :rut", { rut })
        .getOne();

      if (!student) {
        throw new BadRequestException('QR inválido o alumno no registrado');
      }

      // 2. Validar alumno activo
      this.validateActiveStudent(student);

      // 3. Buscar reservas con profesor
      const bookings = await manager.getRepository(Booking).find({
        where: {
          student: { id: student.id },
          date: today,
        },
        relations: ['slot', 'slot.teacher', 'slot.teacher.user'],
      });

      // 4. Filtrar reservas autorizadas
      const authorizedBookings = bookings.filter((booking) => {
        if (validatorRole === UserRole.ADMIN) {
          return true;
        }

        return (
          booking.slot?.teacher?.active === true &&
          booking.slot?.teacher?.user?.id === validatorUserId
        );
      });

      // 5. Buscar reservas libres
      const freeSchedules = await manager.getRepository(FreeSchedule).find({
        where: {
          studentId: student.id,
          date: today,
        },
      });

      // 6. Obtener reservas pendientes
      const pendingBookings = authorizedBookings.filter(
        (booking) => booking.status === BookingStatus.BOOKED,
      );

      const pendingFree = freeSchedules.filter(
        (free) => free.status === FreeScheduleStatus.BOOKED,
      );

      const totalPending = pendingBookings.length + pendingFree.length;

      // 7. Sin reservas pendientes
      if (totalPending === 0) {
        const alreadyAttended =
          authorizedBookings.some(
            (booking) => booking.status === BookingStatus.ATTENDED,
          ) ||
          freeSchedules.some(
            (free) => free.status === FreeScheduleStatus.ATTENDED,
          );

        if (alreadyAttended) {
          throw new BadRequestException('Asistencia ya registrada');
        }

        throw new BadRequestException('No existe una reserva válida para hoy');
      }

      // 8. Evitar registrar una reserva incorrecta
      if (totalPending > 1) {
        throw new BadRequestException(
          'Existe más de una reserva pendiente. ' +
            'Registrar asistencia desde la agenda',
        );
      }

      // 9. Registrar asistencia con profesor
      if (pendingBookings.length === 1) {
        const booking = pendingBookings[0];

        await this.markBookingAttended(manager, booking.id);

        return {
          ok: true,
          type: 'BOOKING',
          referenceId: booking.id,
          date: today,
        };
      }

      // 10. Registrar asistencia plan libre
      const free = pendingFree[0];

      await this.markFreeAttended(manager, free.id);

      return {
        ok: true,
        type: 'FREE',
        referenceId: free.id,
        date: today,
      };
    });
  }

  // =====================================================
  // VALIDAR TOKEN UUID ANTIGUO
  // =====================================================

  private async validateLegacyToken(
    token: string,
    validatorUserId: number,
    validatorRole: UserRole,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const tokenRepository = manager.getRepository(AttendanceToken);

      // Bloqueo del registro durante la transacción
      const record = await tokenRepository.findOne({
        where: { token },
        lock: { mode: 'pessimistic_write' },
      });

      if (!record) {
        throw new BadRequestException('QR inválido');
      }

      if (record.used) {
        throw new BadRequestException('QR ya usado');
      }

      // Expiración de 6 horas
      const diffMinutes = (Date.now() - record.createdAt.getTime()) / 60000;

      if (diffMinutes > 360) {
        throw new BadRequestException('QR expirado');
      }

      // Validar fecha actual
      if (record.date !== this.getTodayChile()) {
        throw new BadRequestException('El QR no corresponde al día actual');
      }

      // =============================================
      // RESERVA CON PROFESOR
      // =============================================

      if (record.referenceType === 'BOOKING') {
        const booking = await manager.getRepository(Booking).findOne({
          where: { id: record.referenceId },
          relations: [
            'student',
            'student.user',
            'slot',
            'slot.teacher',
            'slot.teacher.user',
          ],
        });

        if (!booking) {
          throw new BadRequestException('Reserva no encontrada');
        }

        this.validateActiveStudent(booking.student);

        if (booking.date !== record.date) {
          throw new BadRequestException('Fecha de reserva incorrecta');
        }

        if (
          validatorRole === UserRole.TEACHER &&
          (booking.slot?.teacher?.active !== true ||
            booking.slot?.teacher?.user?.id !== validatorUserId)
        ) {
          throw new ForbiddenException('No estás autorizado para esta reserva');
        }

        await this.markBookingAttended(manager, booking.id);
      }

      // =============================================
      // RESERVA LIBRE
      // =============================================
      else if (record.referenceType === 'FREE') {
        const free = await manager.getRepository(FreeSchedule).findOne({
          where: { id: record.referenceId },
          relations: ['student', 'student.user'],
        });

        if (!free) {
          throw new BadRequestException('Reserva libre no encontrada');
        }

        this.validateActiveStudent(free.student);

        if (free.date !== record.date) {
          throw new BadRequestException('Fecha de reserva incorrecta');
        }

        await this.markFreeAttended(manager, free.id);
      } else {
        throw new BadRequestException('Tipo de reserva inválido');
      }

      // Quemar token UUID
      record.used = true;

      await tokenRepository.save(record);

      return { ok: true };
    });
  }

  // =====================================================
  // REGISTRAR ASISTENCIA CON PROFESOR
  // ACTUALIZACIÓN ATÓMICA
  // =====================================================

  private async markBookingAttended(manager: EntityManager, bookingId: number) {
    const result = await manager.getRepository(Booking).update(
      {
        id: bookingId,
        status: BookingStatus.BOOKED,
      },
      {
        status: BookingStatus.ATTENDED,
      },
    );

    if (result.affected !== 1) {
      throw new BadRequestException(
        'Asistencia ya registrada o reserva no disponible',
      );
    }
  }

  // =====================================================
  // REGISTRAR ASISTENCIA PLAN LIBRE
  // ACTUALIZACIÓN ATÓMICA
  // =====================================================

  private async markFreeAttended(manager: EntityManager, freeId: number) {
    const result = await manager.getRepository(FreeSchedule).update(
      {
        id: freeId,
        status: FreeScheduleStatus.BOOKED,
      },
      {
        status: FreeScheduleStatus.ATTENDED,
        attendedAt: new Date(),
      },
    );

    if (result.affected !== 1) {
      throw new BadRequestException(
        'Asistencia ya registrada o reserva no disponible',
      );
    }
  }
}
