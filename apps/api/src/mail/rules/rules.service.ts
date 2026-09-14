import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(emailAccountId?: string) {
    return this.prisma.emailRule.findMany({
      where: emailAccountId ? { emailAccountId } : undefined,
      include: { conditions: true },
    });
  }

  // 이슈 4: conditions는 1~5개, 2개 이상이면 logicalOperator(AND/OR) 필요
  create(data: {
    emailAccountId: string;
    logicalOperator: 'AND' | 'OR';
    actionType: string;
    conditions: { conditionType: string; conditionValue: any }[];
  }) {
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
}
