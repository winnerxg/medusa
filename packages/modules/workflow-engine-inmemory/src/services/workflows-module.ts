import {
  Context,
  DAL,
  InternalModuleDeclaration,
  ModuleJoinerConfig,
  ModulesSdkTypes,
  WorkflowsSdkTypes,
} from "@medusajs/types"
import {
  InjectSharedContext,
  MedusaContext,
  ModulesSdkUtils,
} from "@medusajs/utils"
import type {
  ReturnWorkflow,
  UnwrapWorkflowInputDataType,
} from "@medusajs/workflows-sdk"
import { WorkflowExecution } from "@models"
import { WorkflowOrchestratorService } from "@services"
import { entityNameToLinkableKeysMap, joinerConfig } from "../joiner-config"

type InjectedDependencies = {
  baseRepository: DAL.RepositoryService
  workflowExecutionService: ModulesSdkTypes.IMedusaInternalService<any>
  workflowOrchestratorService: WorkflowOrchestratorService
}

export class WorkflowsModuleService<
  TWorkflowExecution extends WorkflowExecution = WorkflowExecution
> extends ModulesSdkUtils.MedusaService<{
  WorkflowExecution: { dto: WorkflowExecution }
}>({ WorkflowExecution }, entityNameToLinkableKeysMap) {
  protected baseRepository_: DAL.RepositoryService
  protected workflowExecutionService_: ModulesSdkTypes.IMedusaInternalService<TWorkflowExecution>
  protected workflowOrchestratorService_: WorkflowOrchestratorService

  constructor(
    {
      baseRepository,
      workflowExecutionService,
      workflowOrchestratorService,
    }: InjectedDependencies,
    protected readonly moduleDeclaration: InternalModuleDeclaration
  ) {
    // @ts-ignore
    super(...arguments)

    this.baseRepository_ = baseRepository
    this.workflowExecutionService_ = workflowExecutionService
    this.workflowOrchestratorService_ = workflowOrchestratorService
  }

  __joinerConfig(): ModuleJoinerConfig {
    return joinerConfig
  }

  @InjectSharedContext()
  async run<TWorkflow extends string | ReturnWorkflow<any, any, any>>(
    workflowIdOrWorkflow: TWorkflow,
    options: WorkflowsSdkTypes.WorkflowOrchestratorRunDTO<
      TWorkflow extends ReturnWorkflow<any, any, any>
        ? UnwrapWorkflowInputDataType<TWorkflow>
        : unknown
    > = {},
    @MedusaContext() context: Context = {}
  ) {
    const ret = await this.workflowOrchestratorService_.run<
      TWorkflow extends ReturnWorkflow<any, any, any>
        ? UnwrapWorkflowInputDataType<TWorkflow>
        : unknown
    >(workflowIdOrWorkflow, options, context)

    return ret as any
  }

  @InjectSharedContext()
  async getRunningTransaction(
    workflowId: string,
    transactionId: string,
    @MedusaContext() context: Context = {}
  ) {
    return await this.workflowOrchestratorService_.getRunningTransaction(
      workflowId,
      transactionId,
      context
    )
  }

  @InjectSharedContext()
  async setStepSuccess(
    {
      idempotencyKey,
      stepResponse,
      options,
    }: {
      idempotencyKey: string | object
      stepResponse: unknown
      options?: Record<string, any>
    },
    @MedusaContext() context: Context = {}
  ) {
    return await this.workflowOrchestratorService_.setStepSuccess(
      {
        idempotencyKey,
        stepResponse,
        options,
      } as any,
      context
    )
  }

  @InjectSharedContext()
  async setStepFailure(
    {
      idempotencyKey,
      stepResponse,
      options,
    }: {
      idempotencyKey: string | object
      stepResponse: unknown
      options?: Record<string, any>
    },
    @MedusaContext() context: Context = {}
  ) {
    return await this.workflowOrchestratorService_.setStepFailure(
      {
        idempotencyKey,
        stepResponse,
        options,
      } as any,
      context
    )
  }

  @InjectSharedContext()
  async subscribe(
    args: {
      workflowId: string
      transactionId?: string
      subscriber: Function
      subscriberId?: string
    },
    @MedusaContext() context: Context = {}
  ) {
    return this.workflowOrchestratorService_.subscribe(args as any, context)
  }

  @InjectSharedContext()
  async unsubscribe(
    args: {
      workflowId: string
      transactionId?: string
      subscriberOrId: string | Function
    },
    @MedusaContext() context: Context = {}
  ) {
    return this.workflowOrchestratorService_.unsubscribe(args as any, context)
  }
}
