import { IPromotionModuleService } from "@medusajs/types"
import {
  ApplicationMethodType,
  CampaignBudgetType,
  Modules,
  PromotionType,
} from "@medusajs/utils"
import { moduleIntegrationTestRunner, SuiteOptions } from "medusa-test-utils"
import { createCampaigns } from "../../../__fixtures__/campaigns"
import {
  createDefaultPromotion,
  createDefaultPromotions,
  createPromotions,
} from "../../../__fixtures__/promotion"

jest.setTimeout(30000)

moduleIntegrationTestRunner({
  moduleName: Modules.PROMOTION,
  testSuite: ({
    MikroOrmWrapper,
    service,
  }: SuiteOptions<IPromotionModuleService>) => {
    describe("Promotion Service", () => {
      beforeEach(async () => {
        await createCampaigns(MikroOrmWrapper.forkManager())
      })

      describe("create", () => {
        it("should throw an error when required params are not passed", async () => {
          const error = await createDefaultPromotion(service, {
            code: undefined,
          }).catch((e) => e)

          expect(error.message).toContain(
            "Value for Promotion.code is required, 'undefined' found"
          )
        })

        it("should create a basic promotion successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {})

          const [promotion] = await service.listPromotions({
            id: [createdPromotion.id],
          })

          expect(promotion).toEqual(
            expect.objectContaining({
              code: "PROMOTION_TEST",
              is_automatic: false,
              type: "standard",
            })
          )
        })

        it("should throw error when percentage type and value is greater than 100", async () => {
          const error = await createDefaultPromotion(service, {
            type: PromotionType.STANDARD,
            application_method: {
              type: ApplicationMethodType.PERCENTAGE,
              value: 1000,
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "Application Method value should be a percentage number between 0 and 100"
          )
        })

        it("should throw an error when both campaign and campaign_id are provided", async () => {
          const startsAt = new Date("01/01/2023")
          const endsAt = new Date("01/01/2023")

          const error = await createDefaultPromotion(service, {
            campaign_id: "campaign-id-1",
            campaign: {
              name: "test",
              campaign_identifier: "test-promotion-test",
              starts_at: startsAt,
              ends_at: endsAt,
              budget: {
                type: CampaignBudgetType.SPEND,
                used: 100,
                limit: 100,
              },
            },
          }).catch((e) => e)

          expect(error.message).toContain(
            "Provide either the 'campaign' or 'campaign_id' parameter; both cannot be used simultaneously."
          )
        })

        it("should create a basic promotion with campaign successfully", async () => {
          const startsAt = new Date("01/01/2023")
          const endsAt = new Date("01/01/2023")

          const createdPromotion = await createDefaultPromotion(service, {
            code: "PROMOTION_TEST",
            type: PromotionType.STANDARD,
            campaign_id: undefined,
            campaign: {
              name: "test",
              campaign_identifier: "test-promotion-test",
              starts_at: startsAt,
              ends_at: endsAt,
              budget: {
                type: CampaignBudgetType.SPEND,
                currency_code: "USD",
                used: 100,
                limit: 100,
              },
            },
          })

          const [promotion] = await service.listPromotions(
            { id: [createdPromotion.id] },
            { relations: ["campaign.budget"] }
          )

          expect(promotion).toEqual(
            expect.objectContaining({
              code: "PROMOTION_TEST",
              is_automatic: false,
              type: "standard",
              application_method: expect.any(Object),
              campaign: expect.objectContaining({
                name: "test",
                campaign_identifier: "test-promotion-test",
                starts_at: startsAt,
                ends_at: endsAt,
                budget: expect.objectContaining({
                  type: CampaignBudgetType.SPEND,
                  currency_code: "USD",
                  used: 100,
                  limit: 100,
                }),
              }),
            })
          )
        })

        it("should create a basic promotion with an existing campaign successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            campaign_id: "campaign-id-1",
            code: "PROMOTION_TEST",
          })

          const [promotion] = await service.listPromotions(
            { id: [createdPromotion.id] },
            { relations: ["campaign.budget"] }
          )

          expect(promotion).toEqual(
            expect.objectContaining({
              code: "PROMOTION_TEST",
              is_automatic: false,
              type: "standard",
              campaign: expect.objectContaining({
                id: "campaign-id-1",
                budget: expect.objectContaining({
                  type: CampaignBudgetType.SPEND,
                  limit: 1000,
                  used: 0,
                }),
              }),
            })
          )
        })

        it("should throw error when creating an item application method without allocation", async () => {
          const error = await createDefaultPromotion(service, {
            type: PromotionType.STANDARD,
            application_method: {
              allocation: undefined,
              target_type: "items",
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "application_method.allocation should be either 'across OR each' when application_method.target_type is either 'shipping_methods OR items'"
          )
        })

        it("should throw error when creating an item application, each allocation, without max quanity", async () => {
          const error = await createDefaultPromotion(service, {
            application_method: {
              allocation: "each",
              max_quantity: undefined,
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "application_method.max_quantity is required when application_method.allocation is 'each'"
          )
        })

        it("should throw error when creating an order application method with rules", async () => {
          const error = await createDefaultPromotion(service, {
            application_method: {
              target_type: "order",
              target_rules: [
                {
                  attribute: "product_id",
                  operator: "eq",
                  values: ["prod_tshirt"],
                },
              ],
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "Target rules for application method with target type (order) is not allowed"
          )
        })

        it("should create a promotion with rules successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            rules: [
              {
                attribute: "customer_group_id",
                operator: "in",
                values: ["VIP", "top100"],
              },
            ],
          })

          const [promotion] = await service.listPromotions(
            { id: [createdPromotion.id] },
            { relations: ["rules", "rules.values"] }
          )

          expect(promotion).toEqual(
            expect.objectContaining({
              code: "PROMOTION_TEST",
              is_automatic: false,
              type: "standard",
              rules: [
                expect.objectContaining({
                  attribute: "customer_group_id",
                  operator: "in",
                  values: expect.arrayContaining([
                    expect.objectContaining({
                      value: "VIP",
                    }),
                    expect.objectContaining({
                      value: "top100",
                    }),
                  ]),
                }),
              ],
            })
          )
        })

        it("should create a promotion with rules with single value successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            rules: [
              {
                attribute: "customer_group_id",
                operator: "eq",
                values: "VIP",
              },
            ],
          })

          const [promotion] = await service.listPromotions(
            { id: [createdPromotion.id] },
            { relations: ["rules", "rules.values"] }
          )

          expect(promotion).toEqual(
            expect.objectContaining({
              code: "PROMOTION_TEST",
              is_automatic: false,
              type: "standard",
              rules: [
                expect.objectContaining({
                  attribute: "customer_group_id",
                  operator: "eq",
                  values: expect.arrayContaining([
                    expect.objectContaining({
                      value: "VIP",
                    }),
                  ]),
                }),
              ],
            })
          )
        })

        it("should throw an error when rule attribute is invalid", async () => {
          const error = await createDefaultPromotion(service, {
            rules: [
              {
                attribute: "",
                operator: "eq",
                values: "VIP",
              } as any,
            ],
          }).catch((e) => e)

          expect(error.message).toContain(
            "rules[].attribute is a required field"
          )
        })

        it("should throw an error when rule operator is invalid", async () => {
          let error = await createDefaultPromotion(service, {
            rules: [
              {
                attribute: "customer_group",
                operator: "",
                values: "VIP",
              } as any,
            ],
          }).catch((e) => e)

          expect(error.message).toContain(
            "rules[].operator is a required field"
          )

          error = await createDefaultPromotion(service, {
            rules: [
              {
                attribute: "customer_group",
                operator: "doesnotexist",
                values: "VIP",
              } as any,
            ],
          }).catch((e) => e)

          expect(error.message).toContain(
            "rules[].operator (doesnotexist) is invalid. It should be one of gte, lte, gt, lt, eq, ne, in"
          )
        })

        it("should create a basic buyget promotion successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules_min_quantity: 1,
              buy_rules: [
                {
                  attribute: "product_collection",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
              target_rules: [
                {
                  attribute: "product_collection",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
            } as any,
          })

          const [promotion] = await service.listPromotions({
            id: [createdPromotion.id],
          })

          expect(promotion).toEqual(
            expect.objectContaining({
              code: "PROMOTION_TEST",
              is_automatic: false,
              type: PromotionType.BUYGET,
            })
          )
        })

        it("should throw an error when target_rules are not present for buyget promotion", async () => {
          const error = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules_min_quantity: 1,
              buy_rules: [
                {
                  attribute: "product_collection",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "Target rules are required for buyget promotion type"
          )
        })

        it("should throw an error when buy_rules are not present for buyget promotion", async () => {
          const error = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules_min_quantity: 1,
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "Buy rules are required for buyget promotion type"
          )
        })

        it("should throw an error when apply_to_quantity is not present for buyget promotion", async () => {
          const error = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              buy_rules_min_quantity: 1,
              buy_rules: [
                {
                  attribute: "product_collection.id",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
              target_rules: [
                {
                  attribute: "product.id",
                  operator: "eq",
                  values: ["prod_mat"],
                },
              ],
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "apply_to_quantity is a required field for Promotion type of buyget"
          )
        })

        it("should throw an error when buy_rules_min_quantity is not present for buyget promotion", async () => {
          const error = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules: [
                {
                  attribute: "product_collection.id",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
              target_rules: [
                {
                  attribute: "product.id",
                  operator: "eq",
                  values: ["prod_mat"],
                },
              ],
            } as any,
          }).catch((e) => e)

          expect(error.message).toContain(
            "buy_rules_min_quantity is a required field for Promotion type of buyget"
          )
        })

        it("should create a buyget promotion with rules successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules_min_quantity: 1,
              buy_rules: [
                {
                  attribute: "product_collection.id",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
              target_rules: [
                {
                  attribute: "product.id",
                  operator: "eq",
                  values: "prod_mat",
                },
              ],
            } as any,
          })

          expect(createdPromotion).toEqual(
            expect.objectContaining({
              type: PromotionType.BUYGET,
              application_method: expect.objectContaining({
                apply_to_quantity: 1,
                buy_rules_min_quantity: 1,
                target_rules: [
                  expect.objectContaining({
                    attribute: "product.id",
                    operator: "eq",
                    values: [expect.objectContaining({ value: "prod_mat" })],
                  }),
                ],
                buy_rules: [
                  expect.objectContaining({
                    attribute: "product_collection.id",
                    operator: "eq",
                    values: [expect.objectContaining({ value: "pcol_towel" })],
                  }),
                ],
              }),
            })
          )
        })
      })

      describe("update", () => {
        it("should throw an error when required params are not passed", async () => {
          const error = await service
            .updatePromotions([
              {
                type: PromotionType.STANDARD,
              } as any,
            ])
            .catch((e) => e)

          expect(error.message).toContain('Promotion with id "" not found')
        })

        it("should update the attributes of a promotion successfully", async () => {
          await createDefaultPromotions(service)

          const [updatedPromotion] = await service.updatePromotions([
            {
              id: "promotion-id-1",
              is_automatic: true,
              code: "TEST",
              type: PromotionType.BUYGET,
            } as any,
          ])

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              is_automatic: true,
              code: "TEST",
              type: PromotionType.BUYGET,
            })
          )
        })

        it("should update the attributes of a application method successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            application_method: { value: 100 },
          } as any)
          const applicationMethod = createdPromotion.application_method

          const [updatedPromotion] = await service.updatePromotions([
            {
              id: createdPromotion.id,
              application_method: {
                id: applicationMethod?.id!,
                value: 200,
              },
            },
          ])

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              application_method: expect.objectContaining({
                value: 200,
              }),
            })
          )
        })

        it("should change max_quantity to 0 when target_type is changed to order", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            application_method: { max_quantity: 500, allocation: "each" },
          } as any)
          const applicationMethod = createdPromotion.application_method

          const [updatedPromotion] = await service.updatePromotions([
            {
              id: createdPromotion.id,
              application_method: {
                id: applicationMethod?.id as string,
                target_type: "order",
                allocation: "across",
              },
            },
          ])

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              application_method: expect.objectContaining({
                target_type: "order",
                allocation: "across",
                max_quantity: 0,
              }),
            })
          )
        })

        it("should validate the attributes of a application method successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            application_method: {
              type: "fixed",
              target_type: "order",
              allocation: "across",
            },
          } as any)

          const applicationMethod = createdPromotion.application_method

          let error = await service
            .updatePromotions([
              {
                id: createdPromotion.id,
                application_method: {
                  id: applicationMethod?.id!,
                  target_type: "should-error",
                } as any,
              },
            ])
            .catch((e) => e)

          expect(error.message).toContain(
            `application_method.target_type should be one of order, shipping_methods, items`
          )

          error = await service
            .updatePromotions([
              {
                id: createdPromotion.id,
                application_method: {
                  id: applicationMethod?.id as string,
                  allocation: "should-error",
                } as any,
              },
            ])
            .catch((e) => e)

          expect(error.message).toContain(
            `application_method.allocation should be one of each, across`
          )

          error = await service
            .updatePromotions([
              {
                id: createdPromotion.id,
                application_method: {
                  id: applicationMethod?.id as string,
                  type: "should-error",
                } as any,
              },
            ])
            .catch((e) => e)

          expect(error.message).toContain(
            `application_method.type should be one of fixed, percentage`
          )
        })

        it("should update campaign of the promotion", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            campaign_id: "campaign-id-1",
          })

          const [updatedPromotion] = await service.updatePromotions([
            {
              id: createdPromotion.id,
              campaign_id: "campaign-id-2",
            },
          ])

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              campaign: expect.objectContaining({
                id: "campaign-id-2",
              }),
            })
          )
        })
      })

      describe("retrieve", () => {
        beforeEach(async () => {
          await createDefaultPromotions(service)
        })

        const id = "promotion-id-1"

        it("should return promotion for the given id", async () => {
          const promotion = await service.retrievePromotion(id)

          expect(promotion).toEqual(
            expect.objectContaining({
              id,
            })
          )
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.retrievePromotion("does-not-exist")
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.retrievePromotion(undefined as unknown as string)
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should return promotion based on config select param", async () => {
          const promotion = await service.retrievePromotion(id, {
            select: ["id"],
          })

          const serialized = JSON.parse(JSON.stringify(promotion))

          expect(serialized).toEqual({
            id,
          })
        })
      })

      describe("listAndCount", () => {
        beforeEach(async () => {
          await createPromotions(MikroOrmWrapper.forkManager(), [
            {
              id: "promotion-id-1",
              code: "PROMOTION_1",
              type: PromotionType.STANDARD,
              application_method: {
                type: ApplicationMethodType.FIXED,
                value: "200",
                target_type: "items",
                currency_code: "usd",
              },
            } as any,
            {
              id: "promotion-id-2",
              code: "PROMOTION_2",
              type: PromotionType.STANDARD,
            } as any,
          ])
        })

        it("should return all promotions and count", async () => {
          const [promotions, count] = await service.listAndCountPromotions()

          expect(count).toEqual(2)
          expect(promotions).toEqual([
            {
              id: "promotion-id-1",
              code: "PROMOTION_1",
              campaign_id: null,
              campaign: null,
              is_automatic: false,
              type: "standard",
              application_method: expect.any(Object),
              created_at: expect.any(Date),
              updated_at: expect.any(Date),
              deleted_at: null,
            },
            {
              id: "promotion-id-2",
              code: "PROMOTION_2",
              campaign_id: null,
              campaign: null,
              is_automatic: false,
              type: "standard",
              application_method: null,
              created_at: expect.any(Date),
              updated_at: expect.any(Date),
              deleted_at: null,
            },
          ])
        })

        it("should return all promotions based on config select and relations param", async () => {
          const [promotions, count] = await service.listAndCountPromotions(
            {
              id: ["promotion-id-1"],
            },
            {
              relations: ["application_method"],
              select: ["code", "application_method.type"],
            }
          )

          expect(count).toEqual(1)
          expect(promotions).toEqual([
            {
              id: "promotion-id-1",
              code: "PROMOTION_1",
              application_method: {
                id: expect.any(String),
                type: "fixed",
              },
            },
          ])
        })
      })

      describe("delete", () => {
        it("should soft delete the promotions given an id successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            code: "TEST",
            type: "standard",
          })

          await service.deletePromotions([createdPromotion.id])

          const promotions = await service.listPromotions(
            {
              id: [createdPromotion.id],
            },
            { withDeleted: true }
          )

          expect(promotions).toHaveLength(0)
        })
      })

      describe("softDelete", () => {
        it("should soft delete the promotions given an id successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            code: "TEST",
            type: "standard",
          })

          await service.softDeletePromotions([createdPromotion.id])

          const promotions = await service.listPromotions({
            id: [createdPromotion.id],
          })

          expect(promotions).toHaveLength(0)
        })
      })

      describe("restore", () => {
        it("should restore the promotions given an id successfully", async () => {
          const createdPromotion = await createDefaultPromotion(service, {
            code: "TEST",
            type: "standard",
          })

          await service.softDeletePromotions([createdPromotion.id])

          let promotions = await service.listPromotions({
            id: [createdPromotion.id],
          })

          expect(promotions).toHaveLength(0)
          await service.restorePromotions([createdPromotion.id])

          promotions = await service.listPromotions({
            id: [createdPromotion.id],
          })
          expect(promotions).toHaveLength(1)
        })
      })

      describe("addPromotionRules", () => {
        let promotion

        beforeEach(async () => {
          promotion = await createDefaultPromotion(service, {
            code: "TEST",
            application_method: {
              type: "fixed",
              target_type: "items",
              allocation: "each",
              value: 100,
              max_quantity: 500,
            } as any,
          })
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.addPromotionRules("does-not-exist", [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.addPromotionRules(undefined as unknown as string, [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should successfully add rules to a promotion", async () => {
          const promotionRules = await service.addPromotionRules(promotion.id, [
            {
              attribute: "customer_group_id",
              operator: "in",
              values: ["VIP", "top100"],
            },
          ])

          expect(promotionRules).toEqual([
            expect.objectContaining({
              id: promotionRules[0].id,
              attribute: "customer_group_id",
              operator: "in",
              values: expect.arrayContaining([
                expect.objectContaining({ value: "VIP" }),
                expect.objectContaining({ value: "top100" }),
              ]),
            }),
          ])
        })
      })

      describe("addPromotionTargetRules", () => {
        let promotion

        beforeEach(async () => {
          promotion = await createDefaultPromotion(service, {})
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.addPromotionTargetRules("does-not-exist", [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.addPromotionTargetRules(
              undefined as unknown as string,
              []
            )
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should successfully create target rules for a promotion", async () => {
          const promotionRules = await service.addPromotionTargetRules(
            promotion.id,
            [
              {
                attribute: "customer_group_id",
                operator: "in",
                values: ["VIP", "top100"],
              },
            ]
          )

          expect(promotionRules).toEqual([
            expect.objectContaining({
              id: promotionRules[0].id,
              attribute: "customer_group_id",
              operator: "in",
              values: expect.arrayContaining([
                expect.objectContaining({ value: "VIP" }),
                expect.objectContaining({ value: "top100" }),
              ]),
            }),
          ])
        })
      })

      describe("addPromotionBuyRules", () => {
        let promotion

        beforeEach(async () => {
          promotion = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules_min_quantity: 1,
              buy_rules: [
                {
                  attribute: "product_collection.id",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
              target_rules: [
                {
                  attribute: "product.id",
                  operator: "in",
                  values: ["prod_1", "prod_2"],
                },
              ],
            } as any,
          })
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.addPromotionBuyRules("does-not-exist", [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.addPromotionBuyRules(
              undefined as unknown as string,
              []
            )
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should successfully create buy rules for a buyget promotion", async () => {
          const promotionRules = await service.addPromotionBuyRules(
            promotion.id,
            [
              {
                attribute: "product.id",
                operator: "in",
                values: ["prod_3", "prod_4"],
              },
            ]
          )

          expect(promotionRules).toEqual([
            expect.objectContaining({
              id: promotionRules[0].id,
              attribute: "product.id",
              operator: "in",
              values: expect.arrayContaining([
                expect.objectContaining({ value: "prod_3" }),
                expect.objectContaining({ value: "prod_4" }),
              ]),
            }),
          ])
        })
      })

      describe("removePromotionRules", () => {
        let promotion

        beforeEach(async () => {
          promotion = await createDefaultPromotion(service, {
            rules: [
              {
                attribute: "customer_group_id",
                operator: "in",
                values: ["VIP", "top100"],
              },
            ],
          })
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.removePromotionRules("does-not-exist", [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.removePromotionRules(
              undefined as unknown as string,
              []
            )
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should successfully remove rules for a promotion", async () => {
          const ruleIds = promotion.rules.map((rule) => rule.id)

          await service.removePromotionRules(promotion.id, ruleIds)

          const updatedPromotion = await service.retrievePromotion(
            promotion.id,
            {
              relations: ["rules", "rules.values"],
            }
          )

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              id: promotion.id,
              rules: [],
            })
          )
        })
      })

      describe("removePromotionTargetRules", () => {
        let promotion

        beforeEach(async () => {
          promotion = await createDefaultPromotion(service, {
            application_method: {
              target_rules: [
                {
                  attribute: "customer_group_id",
                  operator: "in",
                  values: ["VIP", "top100"],
                },
              ],
            } as any,
          })
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.removePromotionTargetRules("does-not-exist", [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.removePromotionTargetRules(
              undefined as unknown as string,
              []
            )
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should successfully create rules for a promotion", async () => {
          const ruleIds = promotion.application_method.target_rules.map(
            (rule) => rule.id
          )

          await service.removePromotionTargetRules(promotion.id, ruleIds)

          const updatedPromotion = await service.retrievePromotion(
            promotion.id,
            {
              relations: ["application_method.target_rules.values"],
            }
          )

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              id: promotion.id,
              application_method: expect.objectContaining({
                target_rules: [],
              }),
            })
          )
        })
      })

      describe("removePromotionBuyRules", () => {
        let promotion

        beforeEach(async () => {
          promotion = await createDefaultPromotion(service, {
            type: PromotionType.BUYGET,
            application_method: {
              apply_to_quantity: 1,
              buy_rules_min_quantity: 1,
              target_rules: [
                {
                  attribute: "product.id",
                  operator: "in",
                  values: ["prod_1", "prod_2"],
                },
              ],
              buy_rules: [
                {
                  attribute: "product_collection",
                  operator: "eq",
                  values: ["pcol_towel"],
                },
              ],
            } as any,
          })
        })

        it("should throw an error when promotion with id does not exist", async () => {
          let error

          try {
            await service.removePromotionBuyRules("does-not-exist", [])
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual(
            "Promotion with id: does-not-exist was not found"
          )
        })

        it("should throw an error when a id is not provided", async () => {
          let error

          try {
            await service.removePromotionBuyRules(
              undefined as unknown as string,
              []
            )
          } catch (e) {
            error = e
          }

          expect(error.message).toEqual("promotion - id must be defined")
        })

        it("should successfully remove rules for a promotion", async () => {
          const ruleIds = promotion.application_method.buy_rules.map(
            (rule) => rule.id
          )

          await service.removePromotionBuyRules(promotion.id, ruleIds)

          const updatedPromotion = await service.retrievePromotion(
            promotion.id,
            {
              relations: ["application_method.buy_rules.values"],
            }
          )

          expect(updatedPromotion).toEqual(
            expect.objectContaining({
              id: promotion.id,
              application_method: expect.objectContaining({
                buy_rules: [],
              }),
            })
          )
        })
      })
    })
  },
})
