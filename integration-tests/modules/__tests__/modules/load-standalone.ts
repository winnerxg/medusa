import { medusaIntegrationTestRunner } from "medusa-test-utils"
import { MedusaApp } from "@medusajs/modules-sdk"
import { IProductModuleService } from "@medusajs/types"
import { Modules } from "@medusajs/utils"

jest.setTimeout(30000)

medusaIntegrationTestRunner({
  testSuite: ({ dbConfig: { clientUrl } }) => {
    describe("Standalone Modules", () => {
      beforeAll(async () => {
        process.env.POSTGRES_URL = clientUrl
      })

      afterAll(async () => {
        process.env.POSTGRES_URL = undefined
      })

      it("Should migrate database and initialize Product module using connection string from environment variable ", async function () {
        const { modules, runMigrations } = await MedusaApp({
          modulesConfig: {
            [Modules.PRODUCT]: true,
          },
        })

        await runMigrations()

        const product = modules[
          Modules.PRODUCT
        ] as unknown as IProductModuleService

        const productList = await product.listProducts()

        expect(productList).toEqual(expect.arrayContaining([]))
      })
    })
  },
})
