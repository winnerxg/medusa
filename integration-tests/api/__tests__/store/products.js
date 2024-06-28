const path = require("path")
const setupServer = require("../../../environment-helpers/setup-server")
const { useApi } = require("../../../environment-helpers/use-api")
const { initDb, useDb } = require("../../../environment-helpers/use-db")

const {
  simpleProductFactory,
  simpleSalesChannelFactory,
} = require("../../../factories")

const productSeeder = require("../../../helpers/store-product-seeder")
const adminSeeder = require("../../../helpers/admin-seeder")
const {
  allowedStoreProductsFields,
  defaultStoreProductsRelations,
} = require("@medusajs/medusa/dist")

const adminHeaders = {
  headers: {
    "x-medusa-access-token": "test_token",
  },
}

jest.setTimeout(30000)

describe("/store/products", () => {
  let medusaProcess
  let dbConnection

  const giftCardId = "giftcard"
  const testProductId = "test-product"
  const testProductId1 = "test-product1"
  const testProductId2 = "test-product2"
  const testProductFilteringId1 = "test-product_filtering_1"
  const testProductFilteringId2 = "test-product_filtering_2"

  beforeAll(async () => {
    const cwd = path.resolve(path.join(__dirname, "..", ".."))
    dbConnection = await initDb({
      cwd,
      env: {
        CACHE_TTL: 0,
      },
    })
    medusaProcess = await setupServer({ cwd })
  })

  afterAll(async () => {
    const db = useDb()
    await db.shutdown()
    medusaProcess.kill()
  })

  describe("list params", () => {
    beforeEach(async () => {
      await productSeeder(dbConnection)
      await adminSeeder(dbConnection)
    })

    afterEach(async () => {
      const db = useDb()
      await db.teardown()
    })

    it("Includes Additional prices when queried with a cart id", async () => {
      const api = useApi()

      const response = await api
        .get("/store/products?cart_id=test-cart")
        .catch((err) => {
          console.log(err)
        })

      const products = response.data.products

      expect(products).toHaveLength(5)

      const testProduct = products.find((p) => p.id === testProductId)
      expect(testProduct.variants).toHaveLength(3)

      for (const variant of testProduct.variants) {
        expect(variant.prices).toHaveLength(2)
      }

      expect(products).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: testProductId1,
            collection_id: "test-collection",
          }),
          expect.objectContaining({
            id: testProductId,
            collection_id: "test-collection",
            variants: expect.arrayContaining([
              expect.objectContaining({
                original_price: 100,
                calculated_price: 80,
                prices: expect.arrayContaining([
                  expect.objectContaining({
                    id: "test-price",
                    currency_code: "usd",
                    amount: 100,
                  }),
                  expect.objectContaining({
                    id: "test-price-discount",
                    currency_code: "usd",
                    amount: 80,
                  }),
                ]),
              }),
              expect.objectContaining({
                original_price: 100,
                calculated_price: 80,
                prices: expect.arrayContaining([
                  expect.objectContaining({
                    id: "test-price1",
                    currency_code: "usd",
                    amount: 100,
                  }),
                  expect.objectContaining({
                    id: "test-price1-discount",
                    currency_code: "usd",
                    amount: 80,
                  }),
                ]),
              }),
              expect.objectContaining({
                original_price: 100,
                calculated_price: 80,
                prices: expect.arrayContaining([
                  expect.objectContaining({
                    id: "test-price2",
                    currency_code: "usd",
                    amount: 100,
                  }),
                  expect.objectContaining({
                    id: "test-price2-discount",
                    currency_code: "usd",
                    amount: 80,
                  }),
                ]),
              }),
            ]),
          }),
          expect.objectContaining({
            id: testProductFilteringId2,
            collection_id: "test-collection2",
          }),
          expect.objectContaining({
            id: testProductFilteringId1,
            collection_id: "test-collection1",
          }),
          expect.objectContaining({
            id: giftCardId,
          }),
        ])
      )
    })
  })

  describe("list params", () => {
    beforeEach(async () => {
      await adminSeeder(dbConnection)

      await simpleProductFactory(
        dbConnection,
        {
          title: "testprod",
          status: "published",
          variants: [{ title: "test-variant" }],
        },
        11
      )

      await simpleProductFactory(
        dbConnection,
        {
          title: "testprod3",
          status: "published",
          variants: [{ title: "test-variant1" }],
        },
        12
      )
    })

    afterEach(async () => {
      const db = useDb()
      await db.teardown()
    })

    it("works with expand and fields", async () => {
      const api = useApi()

      const response = await api.get(
        "/store/products?expand=variants,variants.prices&fields=id,title&limit=1"
      )

      expect(response.data).toEqual(
        expect.objectContaining({
          products: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              variants: expect.arrayContaining([
                expect.objectContaining({
                  created_at: expect.any(String),
                  updated_at: expect.any(String),
                  id: expect.any(String),
                  product_id: expect.any(String),
                  prices: expect.arrayContaining([
                    expect.objectContaining({
                      created_at: expect.any(String),
                      updated_at: expect.any(String),
                      id: expect.any(String),
                      variant_id: expect.any(String),
                    }),
                  ]),
                }),
              ]),
            }),
          ]),
        })
      )
    })
  })

  describe("/store/products/:id", () => {
    beforeEach(async () => {
      await productSeeder(dbConnection)
      await adminSeeder(dbConnection)
    })

    afterEach(async () => {
      const db = useDb()
      await db.teardown()
    })

    it("includes default relations", async () => {
      const api = useApi()

      const response = await api.get("/store/products/test-product")

      expect(response.data).toEqual(
        expect.objectContaining({
          product: expect.objectContaining({
            id: testProductId,
            variants: expect.arrayContaining([
              expect.objectContaining({
                id: "test-variant",
                inventory_quantity: 10,
                allow_backorder: false,
                title: "Test variant",
                sku: "test-sku",
                ean: "test-ean",
                upc: "test-upc",
                length: null,
                manage_inventory: true,
                material: null,
                metadata: null,
                mid_code: null,
                height: null,
                hs_code: null,
                origin_country: null,
                calculated_price: null,
                original_price: null,
                barcode: "test-barcode",
                product_id: testProductId,
                created_at: expect.any(String),
                updated_at: expect.any(String),
                options: expect.arrayContaining([
                  expect.objectContaining({
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                ]),
                prices: expect.arrayContaining([
                  expect.objectContaining({
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                    amount: 100,
                    currency_code: "usd",
                    deleted_at: null,
                    min_quantity: null,
                    max_quantity: null,
                    price_list_id: null,
                    id: "test-price",
                    region_id: null,
                    variant_id: "test-variant",
                  }),
                  expect.objectContaining({
                    id: "test-price-discount",
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                    amount: 80,
                    currency_code: "usd",
                    price_list_id: "pl",
                    deleted_at: null,
                    region_id: null,
                    variant_id: "test-variant",
                    price_list: expect.objectContaining({
                      id: "pl",
                      type: "sale",
                      created_at: expect.any(String),
                      updated_at: expect.any(String),
                    }),
                  }),
                ]),
              }),
              expect.objectContaining({
                id: "test-variant_2",
                inventory_quantity: 10,
                allow_backorder: false,
                title: "Test variant rank (2)",
                sku: "test-sku2",
                ean: "test-ean2",
                upc: "test-upc2",
                length: null,
                manage_inventory: true,
                material: null,
                metadata: null,
                mid_code: null,
                height: null,
                hs_code: null,
                origin_country: null,
                barcode: null,
                calculated_price: null,
                original_price: null,
                product_id: testProductId,
                created_at: expect.any(String),
                updated_at: expect.any(String),
                options: expect.arrayContaining([
                  expect.objectContaining({
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                ]),
                prices: expect.arrayContaining([
                  expect.objectContaining({
                    id: "test-price2",
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                    amount: 100,
                    currency_code: "usd",
                    price_list_id: null,
                    deleted_at: null,
                    region_id: null,
                    variant_id: "test-variant_2",
                  }),
                  expect.objectContaining({
                    id: "test-price2-discount",
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                    amount: 80,
                    currency_code: "usd",
                    price_list_id: "pl",
                    deleted_at: null,
                    region_id: null,
                    variant_id: "test-variant_2",
                    price_list: expect.objectContaining({
                      id: "pl",
                      type: "sale",
                      created_at: expect.any(String),
                      updated_at: expect.any(String),
                    }),
                  }),
                ]),
              }),
              expect.objectContaining({
                id: "test-variant_1",
                inventory_quantity: 10,
                allow_backorder: false,
                title: "Test variant rank (1)",
                sku: "test-sku1",
                ean: "test-ean1",
                upc: "test-upc1",
                length: null,
                manage_inventory: true,
                material: null,
                metadata: null,
                mid_code: null,
                height: null,
                hs_code: null,
                origin_country: null,
                calculated_price: null,
                original_price: null,
                barcode: "test-barcode 1",
                product_id: testProductId,
                created_at: expect.any(String),
                updated_at: expect.any(String),
                options: expect.arrayContaining([
                  expect.objectContaining({
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                ]),
                prices: expect.arrayContaining([
                  expect.objectContaining({
                    id: "test-price1",
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                    amount: 100,
                    currency_code: "usd",
                    min_quantity: null,
                    max_quantity: null,
                    price_list_id: null,
                    deleted_at: null,
                    region_id: null,
                    variant_id: "test-variant_1",
                  }),
                  expect.objectContaining({
                    id: "test-price1-discount",
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                    amount: 80,
                    currency_code: "usd",
                    price_list_id: "pl",
                    deleted_at: null,
                    region_id: null,
                    variant_id: "test-variant_1",
                    price_list: expect.objectContaining({
                      id: "pl",
                      type: "sale",
                      created_at: expect.any(String),
                      updated_at: expect.any(String),
                    }),
                  }),
                ]),
              }),
            ]),
            images: expect.arrayContaining([
              expect.objectContaining({
                id: "test-image",
                created_at: expect.any(String),
                updated_at: expect.any(String),
              }),
            ]),
            handle: testProductId,
            title: "Test product",
            profile_id: expect.stringMatching(/^sp_*/),
            description: "test-product-description",
            collection_id: "test-collection",
            collection: expect.objectContaining({
              id: "test-collection",
              created_at: expect.any(String),
              updated_at: expect.any(String),
            }),
            type: expect.objectContaining({
              id: "test-type",
              created_at: expect.any(String),
              updated_at: expect.any(String),
            }),
            tags: expect.arrayContaining([
              expect.objectContaining({
                id: "tag1",
                created_at: expect.any(String),
                updated_at: expect.any(String),
              }),
            ]),
            options: expect.arrayContaining([
              expect.objectContaining({
                id: "test-option",
                values: expect.arrayContaining([
                  expect.objectContaining({
                    id: "test-variant-option",
                    value: "Default variant",
                    option_id: "test-option",
                    variant_id: "test-variant",
                    metadata: null,
                    deleted_at: null,
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                  expect.objectContaining({
                    id: "test-variant-option-1",
                    value: "Default variant 1",
                    option_id: "test-option",
                    variant_id: "test-variant_1",
                    metadata: null,
                    deleted_at: null,
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                  expect.objectContaining({
                    id: "test-variant-option-2",
                    value: "Default variant 2",
                    option_id: "test-option",
                    variant_id: "test-variant_2",
                    metadata: null,
                    deleted_at: null,
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                  expect.objectContaining({
                    id: "test-variant-option-3",
                    value: "Default variant 3",
                    option_id: "test-option",
                    variant_id: "test-variant_3",
                    metadata: null,
                    deleted_at: null,
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                  expect.objectContaining({
                    id: "test-variant-option-4",
                    value: "Default variant 4",
                    option_id: "test-option",
                    variant_id: "test-variant_4",
                    metadata: null,
                    deleted_at: null,
                    created_at: expect.any(String),
                    updated_at: expect.any(String),
                  }),
                ]),
                created_at: expect.any(String),
                updated_at: expect.any(String),
              }),
            ]),
            created_at: expect.any(String),
            updated_at: expect.any(String),
          }),
        })
      )
    })

    it("lists all published products", async () => {
      const api = useApi()

      // update test-product status to published
      await api
        .post(
          "/admin/products/test-product",
          {
            status: "published",
          },
          adminHeaders
        )
        .catch((err) => {
          console.log(err)
        })

      const response = await api.get("/store/products")

      expect(response.status).toEqual(200)
      expect(response.data.products).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: testProductId,
            status: "published",
          }),
        ])
      )
    })

    it("response contains only fields defined with `fields` param", async () => {
      const api = useApi()

      // profile_id is not a column in the products table, so it should be ignored as it
      // will be rejected by typeorm as invalid, though, it is an entity property
      // that we want to return, so it part of the allowedStoreProductsFields
      const fields = allowedStoreProductsFields.filter(
        (f) => f !== "profile_id"
      )

      const response = await api.get(
        `/store/products/test-product?fields=${fields.join(",")}`
      )

      expect(response.status).toEqual(200)

      const expectedProperties = [...fields, ...defaultStoreProductsRelations]
      const actualProperties = [
        ...Object.keys(response.data.product),
        ...Object.keys(response.data.product.variants[0]).map(
          (key) => `variants.${key}`
        ),
        "variants.prices.amount",
        "options.values",
      ]

      expect(Object.keys(response.data.product).length).toEqual(31)
      expect(actualProperties).toEqual(
        expect.arrayContaining(expectedProperties)
      )
    })
  })
})
