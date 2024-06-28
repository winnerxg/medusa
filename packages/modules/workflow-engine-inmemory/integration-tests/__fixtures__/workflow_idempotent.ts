import {
  StepResponse,
  createStep,
  createWorkflow,
} from "@medusajs/workflows-sdk"

const step_1 = createStep(
  "step_1",
  jest.fn((input) => {
    input.test = "test"
    return new StepResponse(input, { compensate: 123 })
  }),
  jest.fn((compensateInput) => {
    if (!compensateInput) {
      return
    }

    console.log("reverted", compensateInput.compensate)
    return new StepResponse({
      reverted: true,
    })
  })
)

const step_2 = createStep(
  "step_2",
  jest.fn((input, context) => {
    if (input) {
      return new StepResponse({ notAsyncResponse: input.hey })
    }
  }),
  jest.fn((_, context) => {
    return new StepResponse({
      step: context.metadata.action,
      idempotency_key: context.metadata.idempotency_key,
      reverted: true,
    })
  })
)

const step_3 = createStep(
  "step_3",
  jest.fn((res) => {
    return new StepResponse({
      done: {
        inputFromSyncStep: res.notAsyncResponse,
      },
    })
  })
)

createWorkflow(
  {
    name: "workflow_idempotent",
    idempotent: true,
  },
  function (input) {
    step_1(input)

    const ret2 = step_2({ hey: "oh" })

    step_2({ hey: "hello" }).config({
      name: "new_step_name",
    })

    return step_3(ret2)
  }
)
