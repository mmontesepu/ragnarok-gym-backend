import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';

import { AttendanceToken } from './attendance.entity';
import { Booking, BookingStatus } from '../bookings/booking.entity';
import { FreeSchedule } from '../free-schedules/free-schedule.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(AttendanceToken)
    private tokenRepo: Repository<AttendanceToken>,

    @InjectRepository(Booking)
    private bookingRepo: Repository<Booking>,

    @InjectRepository(FreeSchedule)
    private freeRepo: Repository<FreeSchedule>,
  ) {}

  async generateForBooking(bookingId: number, date: string) {
    return this.createToken('BOOKING', bookingId, date);
  }

  async generateForFree(freeId: number, date: string) {
    return this.createToken('FREE', freeId, date);
  }

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
      createdAt: new Date(), // 🔥 CLAVE
    });

    await this.tokenRepo.save(record);

    return { token }; // 👈 CLAVE
  }

  async validate(token: any) {
    // ============================
    // NORMALIZAR TOKEN (FIX REAL)
    // ============================
    const realToken = typeof token === 'string' ? token : token.token;

    console.log('RAW TOKEN =>', token);
    console.log('REAL TOKEN =>', realToken);

    // ============================
    // BUSCAR REGISTRO
    // ============================
    const record = await this.tokenRepo.findOne({
      where: { token: realToken },
    });

    console.log('RECORD FOUND =>', record);

    if (!record) throw new BadRequestException('QR inválido');
    if (record.used) throw new BadRequestException('QR ya usado');

    // ============================
    // VALIDAR EXPIRACIÓN (6 HORAS)
    // ============================
    const now = new Date();

    console.log('NOW =>', now);
    console.log('CREATED =>', record.createdAt);

    const diffMinutes = (now.getTime() - record.createdAt.getTime()) / 60000;

    console.log('DIFF MIN =>', diffMinutes);

    if (diffMinutes > 360) {
      throw new BadRequestException('QR expirado');
    }

    // ============================
    // CASO CON PROFESOR
    // ============================
    if (record.referenceType === 'BOOKING') {
      console.log('VALIDATING BOOKING ID =>', record.referenceId);

      const booking = await this.bookingRepo.findOne({
        where: { id: record.referenceId },
      });

      console.log('BOOKING FOUND =>', booking);

      if (!booking) throw new BadRequestException('Reserva no encontrada');

      booking.status = BookingStatus.ATTENDED;
      await this.bookingRepo.save(booking);
    }

    // ============================
    // CASO PLAN LIBRE
    // ============================
    if (record.referenceType === 'FREE') {
      console.log('DELETING FREE ID =>', record.referenceId);

      await this.freeRepo.delete(record.referenceId);
    }

    // ============================
    // MARCAR TOKEN USADO
    // ============================
    record.used = true;
    await this.tokenRepo.save(record);

    console.log('QR VALIDATED OK');

    return { ok: true };
  }
}
