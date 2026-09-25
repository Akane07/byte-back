import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';
import { CorsIoAdapter } from './common/socket-io.adapter';
import { UPLOADS_ROOT, ensureUploadDirs } from './common/uploads';

async function bootstrap() {
  ensureUploadDirs();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const origins = config
    .get<string>('CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim());

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: origins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });
  // WebSocket-шлюз чата работает на том же порту, что и API.
  app.useWebSocketAdapter(new CorsIoAdapter(app, origins));

  // whitelist: лишние поля из тела запроса отбрасываются, а не проходят в базу.
  // transform: строки из query/multipart приводятся к типам из DTO.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.useStaticAssets(UPLOADS_ROOT, { prefix: '/uploads' });

  if (config.get<string>('NODE_ENV') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Freelance Byte API')
      .setDescription('REST API биржи фриланса Freelance Byte')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api', app, () =>
      SwaggerModule.createDocument(app, swaggerConfig),
    );
  }

  await app.listen(config.get<number>('PORT', 3001));
}
bootstrap();
