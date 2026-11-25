import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Evitar identificar innecesariamente
  // la tecnología del servidor
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.disable('x-powered-by');

  // Puerto asignado por Render
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
