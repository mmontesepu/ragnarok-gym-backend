import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../bookings/booking.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  async getDailySchedule(date: string) {
    const bookings = await this.bookingRepo.find({
      where: { date },
      relations: [
        'slot',
        'slot.teacher',
        'student',
        'student.user',
      ],
    });

    const scheduleMap = new Map<string, any>();

    for (const booking of bookings) {
      const key = `${booking.slot.hour}-${booking.slot.teacher.id}`;

      if (!scheduleMap.has(key)) {
        scheduleMap.set(key, {
          hour: booking.slot.hour,
          teacher: {
            firstName: booking.slot.teacher.firstName,
            lastName: booking.slot.teacher.lastName,
          },
          students: [],
        });
      }

      scheduleMap.get(key).students.push({
        firstName: booking.student.firstName,
        lastName: booking.student.lastName,
        email: booking.student.user.email,
        status: booking.status,
      });
    }

    return Array.from(scheduleMap.values()).sort((a, b) =>
      a.hour.localeCompare(b.hour),
    );
  }
}
