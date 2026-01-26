import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleSlotsController } from './schedule-slots.controller';

describe('ScheduleSlotsController', () => {
  let controller: ScheduleSlotsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleSlotsController],
    }).compile();

    controller = module.get<ScheduleSlotsController>(ScheduleSlotsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
