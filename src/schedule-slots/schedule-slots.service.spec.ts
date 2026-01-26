import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleSlotsService } from './schedule-slots.service';

describe('ScheduleSlotsService', () => {
  let service: ScheduleSlotsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScheduleSlotsService],
    }).compile();

    service = module.get<ScheduleSlotsService>(ScheduleSlotsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
