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
    });

    await this.tokenRepo.save(record);

    return { token }; // 👈 CLAVE
  }

  async validate(token: string) {
    const record = await this.tokenRepo.findOne({ where: { token } });

    if (!record) throw new BadRequestException('QR inválido');
    if (record.used) throw new BadRequestException('QR ya usado');

    const today = new Date().toISOString().slice(0, 10);
    if (record.date !== today) {
      throw new BadRequestException('QR expirado');
    }

    if (record.referenceType === 'BOOKING') {
      const booking = await this.bookingRepo.findOne({
        where: { id: record.referenceId },
      });

      if (!booking) throw new BadRequestException('Reserva no encontrada');

      booking.status = BookingStatus.ATTENDED;
      await this.bookingRepo.save(booking);
    }

    if (record.referenceType === 'FREE') {
      await this.freeRepo.delete(record.referenceId);
    }

    record.used = true;
    await this.tokenRepo.save(record);

    return { ok: true };
  }
}
