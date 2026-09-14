import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server';
import { PrismaService } from '../common/prisma/prisma.service';

// 기술설계서 1장 "기기별 생체인증(Platform Authenticator)" — 이 앱 로그인을 위한
// Google OAuth와 완전히 별개로, 신뢰된 기기에서 마스터 비밀번호 타이핑을 생략해주는 용도.
// apps/web이 실제 서비스되는 도메인이 정해지면 아래 env 값을 그 도메인으로 교체해야 한다.
const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? '통합 계정관리 프로그램';
const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const RP_ORIGIN = process.env.WEBAUTHN_RP_ORIGIN ?? 'http://localhost:3000';

@Injectable()
export class WebAuthnService {
  constructor(private readonly prisma: PrismaService) {}

  async createRegistrationOptions(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const existingDevices = await this.prisma.trustedDevice.findMany({ where: { userId } });

    return generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.googleEmail,
      userID: new Uint8Array(Buffer.from(user.id)),
      attestationType: 'none',
      excludeCredentials: existingDevices.map((device) => ({ id: device.webauthnCredentialId })),
      // platform authenticator + residentKey: 기획서가 요구하는 "이 기기의 지문/FaceID로
      // 곧바로 잠금해제"(사용자 이메일 입력 없이) 흐름을 만들기 위한 조합.
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
    });
  }

  async verifyRegistration(
    userId: string,
    deviceLabel: string,
    expectedChallenge: string,
    response: RegistrationResponseJSON,
  ) {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    }).catch((err: Error) => {
      throw new UnauthorizedException(`생체인증 등록 검증 실패: ${err.message}`);
    });

    if (!verification.verified) {
      throw new UnauthorizedException('생체인증 등록을 검증할 수 없습니다.');
    }

    const { credential } = verification.registrationInfo;
    try {
      return await this.prisma.trustedDevice.create({
        data: {
          userId,
          deviceLabel,
          webauthnCredentialId: credential.id,
          webauthnPublicKey: Buffer.from(credential.publicKey).toString('base64'),
          counter: credential.counter,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new ConflictException('이미 등록된 기기입니다.');
      }
      throw err;
    }
  }

  // 사용자를 먼저 식별할 필요 없이(디스커버러블 credential) 옵션을 발급한다 —
  // 이게 "생체인증만으로 잠금해제"의 핵심: 이메일/아이디 입력 없이 기기가 후보를 제시한다.
  createAuthenticationOptions() {
    return generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
    });
  }

  // 반환값의 userId로 호출자가 세션을 로그인+잠금해제 상태로 만든다 (AuthService 쪽 책임).
  async verifyAuthentication(expectedChallenge: string, response: AuthenticationResponseJSON) {
    const device = await this.prisma.trustedDevice.findUnique({
      where: { webauthnCredentialId: response.id },
    });
    if (!device) {
      throw new UnauthorizedException('등록되지 않은 기기입니다.');
    }

    const credential: WebAuthnCredential = {
      id: device.webauthnCredentialId,
      publicKey: new Uint8Array(Buffer.from(device.webauthnPublicKey, 'base64')),
      counter: device.counter,
    };

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      credential,
    }).catch((err: Error) => {
      throw new UnauthorizedException(`생체인증 검증 실패: ${err.message}`);
    });

    if (!verification.verified) {
      throw new UnauthorizedException('생체인증을 검증할 수 없습니다.');
    }

    await this.prisma.trustedDevice.update({
      where: { id: device.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });

    return device;
  }

  async removeDevice(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.trustedDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) {
      throw new NotFoundException('등록된 기기를 찾을 수 없습니다.');
    }
    await this.prisma.trustedDevice.delete({ where: { id: deviceId } });
  }
}
