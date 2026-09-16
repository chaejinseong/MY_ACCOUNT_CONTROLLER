import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  // emailAccount.userId로 걸러서 다른 사용자의 규칙이 보이지 않게 한다.
  findAll(userId: string, emailAccountId?: string) {
    return this.prisma.emailRule.findMany({
      where: {
        emailAccount: { userId },
        ...(emailAccountId ? { emailAccountId } : {}),
      },
      include: { conditions: true },
    });
  }

  // 이슈 4: conditions는 1~5개, 2개 이상이면 logicalOperator(AND/OR) 필요
  async create(
    userId: string,
    data: {
      emailAccountId: string;
      logicalOperator: 'AND' | 'OR';
      actionType: string;
      conditions: { conditionType: string; conditionValue: any }[];
    },
  ) {
    const emailAccount = await this.prisma.emailAccount.findFirst({
      where: { id: data.emailAccountId, userId },
    });
    if (!emailAccount) {
      throw new NotFoundException('연결된 메일 계정을 찾을 수 없습니다.');
    }

    return this.prisma.emailRule.create({
      data: {
        emailAccountId: data.emailAccountId,
        logicalOperator: data.logicalOperator,
        actionType: data.actionType,
        conditions: { create: data.conditions },
      },
      include: { conditions: true },
    });
  }

  // conditions를 넘기면 기존 조건을 전부 지우고 새로 만든다(부분 patch가 아니라 통째로 교체) —
  // create()와 동일한 1~5개 제약은 프론트엔드에서 강제한다.
  async update(
    userId: string,
    id: string,
    data: {
      logicalOperator?: 'AND' | 'OR';
      actionType?: string;
      isActive?: boolean;
      conditions?: { conditionType: string; conditionValue: any }[];
    },
  ) {
    const rule = await this.prisma.emailRule.findFirst({ where: { id, emailAccount: { userId } } });
    if (!rule) {
      throw new NotFoundException('규칙을 찾을 수 없습니다.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (data.conditions) {
        await tx.emailRuleCondition.deleteMany({ where: { ruleId: id } });
      }
      return tx.emailRule.update({
        where: { id },
        data: {
          ...(data.logicalOperator ? { logicalOperator: data.logicalOperator } : {}),
          ...(data.actionType ? { actionType: data.actionType } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.conditions ? { conditions: { create: data.conditions } } : {}),
        },
        include: { conditions: true },
      });
    });
  }

  // 규칙 삭제는 연결된 EmailCandidate 기록도 함께 지운다(스키마의 onDelete: Cascade) —
  // AccountsController의 계정 연동 해제와 동일한 정책(rules.controller.ts 참고).
  async remove(userId: string, id: string): Promise<void> {
    const rule = await this.prisma.emailRule.findFirst({ where: { id, emailAccount: { userId } } });
    if (!rule) {
      throw new NotFoundException('규칙을 찾을 수 없습니다.');
    }
    await this.prisma.emailRule.delete({ where: { id } });
  }
}
