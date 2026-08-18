import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module';
import { User } from './../src/identity/user/entities/user.entity';
import { VerificationService } from './../src/verification/verification.service';

const getAccessToken = (body: unknown): string => {
  const accessToken = (body as { accessToken?: unknown }).accessToken;

  if (typeof accessToken !== 'string') {
    throw new Error('Expected an access token in the response body');
  }

  return accessToken;
};

const getCurrentUser = (body: unknown): { sub: string; email: string } => {
  const currentUser = body as { sub?: unknown; email?: unknown };

  if (
    typeof currentUser.sub !== 'string' ||
    typeof currentUser.email !== 'string'
  ) {
    throw new Error('Expected a user payload in the response body');
  }

  return { sub: currentUser.sub, email: currentUser.email };
};

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const verificationService = {
    consumeEmailCode: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VerificationService)
      .useValue(verificationService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('registers, logs in, and reads the current user with a JWT', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'SecurePassword123!';
    const verificationId = '4c7bd9cc-c98c-4e6a-b927-9c8169f0d1e0';
    const verificationCode = '123456';
    const usersRepository = app.get(DataSource).getRepository(User);

    try {
      const registration = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password, verificationId, verificationCode })
        .expect(201);

      const registrationAccessToken = getAccessToken(registration.body);
      expect(verificationService.consumeEmailCode).toHaveBeenCalledWith({
        verificationId,
        code: verificationCode,
        destination: email,
        purpose: 'register',
      });

      const currentUserResponse = await request(app.getHttpServer())
        .get('/auth/me')
        .auth(registrationAccessToken, { type: 'bearer' })
        .expect(200);
      const currentUser = getCurrentUser(currentUserResponse.body);

      expect(currentUser.sub).toEqual(expect.any(String));
      expect(currentUser.email).toBe(email);

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      expect(getAccessToken(login.body)).toEqual(expect.any(String));
    } finally {
      await usersRepository.delete({ email });
    }
  });

  afterEach(async () => {
    await app.close();
  });
});
