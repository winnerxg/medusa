import { readFileSync, writeFileSync } from "fs"
import { OpenAPIV3 } from "openapi-types"
import { basename, join } from "path"
import ts, { SyntaxKind } from "typescript"
import { capitalize, kebabToTitle } from "utils"
import { parse, stringify } from "yaml"
import { DEFAULT_OAS_RESPONSES, SUMMARY_PLACEHOLDER } from "../../constants.js"
import {
  OpenApiDocument,
  OpenApiOperation,
  OpenApiSchema,
} from "../../types/index.js"
import formatOas from "../../utils/format-oas.js"
import getCorrectZodTypeName from "../../utils/get-correct-zod-type-name.js"
import getOasOutputBasePath from "../../utils/get-oas-output-base-path.js"
import isZodObject from "../../utils/is-zod-object.js"
import parseOas, { ExistingOas } from "../../utils/parse-oas.js"
import OasExamplesGenerator from "../examples/oas.js"
import { GeneratorEvent } from "../helpers/generator-event-manager.js"
import OasSchemaHelper from "../helpers/oas-schema.js"
import SchemaFactory from "../helpers/schema-factory.js"
import { GeneratorOptions, GetDocBlockOptions } from "./default.js"
import FunctionKindGenerator, {
  FunctionNode,
  FunctionOrVariableNode,
  VariableNode,
} from "./function.js"
import { API_ROUTE_PARAM_REGEX } from "../helpers/../../constants.js"

const RES_STATUS_REGEX = /^res[\s\S]*\.status\((\d+)\)/

type SchemaDescriptionOptions = {
  symbol?: ts.Symbol
  node?: ts.Node
  nodeType?: ts.Type
  typeStr: string
  parentName?: string
}

export type OasArea = "admin" | "store"

type ParameterType = "query" | "path"

/**
 * OAS generator for API routes. It extends the {@link FunctionKindGenerator}
 * since API routes are functions.
 */
class OasKindGenerator extends FunctionKindGenerator {
  public name = "oas"
  protected allowedKinds: SyntaxKind[] = [ts.SyntaxKind.FunctionDeclaration]
  private MAX_LEVEL = 4

  /**
   * This map collects tags of all the generated OAS, then, once the generation process finishes,
   * it checks if it should be added to the base OAS document of the associated area.
   */
  private tags: Map<OasArea, Set<string>>
  /**
   * The path to the directory holding the base YAML files.
   */
  protected baseOutputPath: string
  protected oasExamplesGenerator: OasExamplesGenerator
  protected oasSchemaHelper: OasSchemaHelper
  protected schemaFactory: SchemaFactory

  constructor(options: GeneratorOptions) {
    super(options)

    this.oasExamplesGenerator = new OasExamplesGenerator()
    this.baseOutputPath = getOasOutputBasePath()

    this.tags = new Map()
    this.oasSchemaHelper = new OasSchemaHelper()
    this.schemaFactory = new SchemaFactory()
    this.init()

    this.generatorEventManager.listen(
      GeneratorEvent.FINISHED_GENERATE_EVENT,
      this.afterGenerate.bind(this)
    )
  }

  /**
   * Check whether the generator can be used for the specified node. The node must be a function that has
   * two parameters of types `MedusaRequest` and `MedusaResponse` respectively.
   *
   * @param node - The node to check.
   * @returns Whether the generator can be used for the specified node.
   */
  isAllowed(node: ts.Node): node is FunctionOrVariableNode {
    const isFunction =
      this.allowedKinds.includes(node.kind) ||
      (ts.isVariableStatement(node) && this.isFunctionVariable(node))

    if (!isFunction) {
      return false
    }

    const functionNode = ts.isFunctionDeclaration(node)
      ? node
      : this.extractFunctionNode(node as VariableNode)

    if (!functionNode) {
      return false
    }

    // function must have 2 parameters, first parameter of type `MedusaRequest`
    // and the second of type `MedusaResponse`
    return (
      (functionNode.parameters.length === 2 &&
        (functionNode.parameters[0].type
          ?.getText()
          .startsWith("MedusaRequest") ||
          functionNode.parameters[0].type
            ?.getText()
            .startsWith("AuthenticatedMedusaRequest")) &&
        functionNode.parameters[1].type
          ?.getText()
          .startsWith("MedusaResponse")) ||
      false
    )
  }

  /**
   * Check whether the node can be documented.
   *
   * @param node - The node to check.
   * @returns Whether the node can be documented.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  canDocumentNode(node: ts.Node): boolean {
    // unlike other generators, this one
    // can update existing OAS, so we just return
    // true
    return true
  }

  /**
   * Try to retrieve the OAS previously generated for the function. If the OAS is retrieved, the
   * OAS is updated rather than created.
   *
   * @param node - The node to retrieve its existing OAS.
   * @returns The node's existing OAS, if available.
   */
  getExistingOas(node: FunctionOrVariableNode): ExistingOas | undefined {
    // read the file holding the OAS, if it's available.
    const fileContent = ts.sys.readFile(this.getAssociatedFileName(node))

    if (!fileContent) {
      // the file doesn't exist, meaning there's no existing OAS.
      return
    }

    return parseOas(fileContent)
  }

  /**
   * Retrieves the docblock of the node. If the node has existing OAS, the OAS is updated and returned. Otherwise,
   * the OAS is generated.
   *
   * @param node - The node to get its OAS.
   * @param options - The options to get the OAS.
   * @returns The OAS as a string that can be used as a comment in a TypeScript file.
   */
  async getDocBlock(
    node: ts.Node | FunctionOrVariableNode,
    options?: GetDocBlockOptions
  ): Promise<string> {
    // TODO use AiGenerator to generate descriptions + examples
    if (!this.isAllowed(node)) {
      return await super.getDocBlock(node, options)
    }

    const actualNode = ts.isVariableStatement(node)
      ? this.extractFunctionNode(node)
      : node

    if (!actualNode) {
      return await super.getDocBlock(node, options)
    }
    const methodName = this.getHTTPMethodName(node)

    const existingOas = this.getExistingOas(node)

    if (existingOas?.oas) {
      return this.updateExistingOas({
        node: actualNode,
        methodName,
        oasOptions: existingOas,
      })
    }

    return this.getNewOasDocBlock({
      node: actualNode,
      methodName,
    })
  }

  /**
   * Generate OAS of a node.
   *
   * @param param0 - The node's details.
   * @returns The OAS comment.
   */
  getNewOasDocBlock({
    node,
    methodName,
  }: {
    /**
     * The node to generate its OAS.
     */
    node: FunctionNode
    /**
     * The lowercase name of the method. For example, `get`.
     */
    methodName: string
  }): string {
    // collect necessary variables
    const { oasPath, normalized: normalizedOasPath } = this.getOasPath(node)
    const splitOasPath = oasPath.split("/")
    const oasPrefix = this.getOasPrefix(methodName, normalizedOasPath)
    const { isAdminAuthenticated, isStoreAuthenticated, isAuthenticated } =
      this.getAuthenticationDetails(node, oasPath)
    const tagName = this.getTagName(splitOasPath)
    const { summary, description } =
      this.knowledgeBaseFactory.tryToGetOasMethodSummaryAndDescription({
        oasPath,
        httpMethod: methodName,
        tag: tagName || "",
      })

    // construct oas
    const oas: OpenApiOperation = {
      operationId: this.getOperationId({
        methodName,
        splitOasPath,
      }),
      summary,
      description,
      "x-authenticated": isAuthenticated,
      parameters: this.getPathParameters({ oasPath, tagName }),
      security: [],
    }

    // retreive query and request parameters
    const { queryParameters, requestSchema } = this.getRequestParameters({
      node,
      tagName,
      methodName,
    })

    oas.parameters?.push(...queryParameters)
    if (requestSchema && Object.keys(requestSchema).length > 0) {
      oas.requestBody = {
        content: {
          "application/json": {
            schema:
              this.oasSchemaHelper.namedSchemaToReference(requestSchema) ||
              this.oasSchemaHelper.schemaChildrenToRefs(requestSchema),
          },
        },
      }
    }

    // retrieve response schema
    const responseSchema = this.getResponseSchema({
      node,
      tagName,
    })

    // retrieve code examples
    // only generate cURL examples, and for the rest
    // check if the --generate-examples option is enabled
    oas["x-codeSamples"] = [
      {
        ...OasExamplesGenerator.CURL_CODESAMPLE_DATA,
        source: this.oasExamplesGenerator.generateCurlExample({
          method: methodName,
          path: normalizedOasPath,
          isAdminAuthenticated,
          isStoreAuthenticated,
          requestSchema,
        }),
      },
    ]

    if (this.options.generateExamples) {
      oas["x-codeSamples"].push(
        {
          ...OasExamplesGenerator.JSCLIENT_CODESAMPLE_DATA,
          source: this.oasExamplesGenerator.generateJSClientExample({
            oasPath,
            httpMethod: methodName,
            area: splitOasPath[0] as OasArea,
            tag: tagName || "",
            isAdminAuthenticated,
            isStoreAuthenticated,
            parameters: (oas.parameters as OpenAPIV3.ParameterObject[])?.filter(
              (parameter) => parameter.in === "path"
            ),
            requestBody: requestSchema,
            responseBody: responseSchema,
          }),
        },
        {
          ...OasExamplesGenerator.MEDUSAREACT_CODESAMPLE_DATA,
          source: "EXAMPLE", // TODO figure out if we can generate examples for medusa react
        }
      )
    }

    // add security details if applicable
    oas.security = this.getSecurity({ isAdminAuthenticated, isAuthenticated })

    if (tagName) {
      oas.tags = [tagName]
    }

    // detect returned response status
    const responseStatus = this.getResponseStatus(node)

    // add responses
    oas.responses = {
      [responseStatus]: {
        description: "OK",
      },
    }

    if (responseSchema && Object.keys(responseSchema).length > 0) {
      ;(oas.responses[responseStatus] as OpenAPIV3.ResponseObject).content = {
        "application/json": {
          schema:
            this.oasSchemaHelper.namedSchemaToReference(responseSchema) ||
            this.oasSchemaHelper.schemaChildrenToRefs(responseSchema),
        },
      }
    }

    oas.responses = {
      ...(oas.responses || {}),
      ...DEFAULT_OAS_RESPONSES,
    }

    // push new tag to the tags property
    if (tagName) {
      const areaTags = this.tags.get(splitOasPath[0] as OasArea)
      areaTags?.add(tagName)
    }

    return formatOas(oas, oasPrefix)
  }

  /**
   * Update an existing OAS operation.
   *
   * @param param0 - The OAS's details.
   * @returns The updated OAS
   */
  updateExistingOas({
    node,
    methodName,
    oasOptions: { oas, oasPrefix },
  }: {
    /**
     * The node that the OAS is associated with.
     */
    node: FunctionNode
    /**
     * The lower case method name of the operation.
     */
    methodName: string
    /**
     * The existing OAS's details.
     */
    oasOptions: ExistingOas
  }): string {
    // collect necessary variables
    const { oasPath, normalized: normalizedOasPath } = this.getOasPath(node)
    const splitOasPath = oasPath.split("/")
    const tagName = this.getTagName(splitOasPath)

    // update tag name
    oas.tags = tagName ? [tagName] : []

    // check if the prefix line should be updated.
    const updatedOasPrefix = this.getOasPrefix(methodName, normalizedOasPath)
    if (updatedOasPrefix !== oasPrefix) {
      oasPrefix = updatedOasPrefix
    }

    // check if operation ID should be updated
    const updatedOperationId = this.getOperationId({
      methodName,
      splitOasPath,
    })

    if (updatedOperationId !== oas.operationId) {
      oas.operationId = updatedOperationId
    }

    // update summary and description either if they're empty or default summary
    const shouldUpdateSummary =
      !oas.summary || oas.summary === SUMMARY_PLACEHOLDER
    const shouldUpdateDescription =
      !oas.description || oas.description === SUMMARY_PLACEHOLDER
    if (shouldUpdateSummary || shouldUpdateDescription) {
      const { summary, description } =
        this.knowledgeBaseFactory.tryToGetOasMethodSummaryAndDescription({
          oasPath,
          httpMethod: methodName,
          tag: tagName || "",
        })

      if (shouldUpdateSummary) {
        oas.summary = summary
      }

      if (shouldUpdateDescription) {
        oas.description = description
      }
    }

    // check if authentication details (including security) should be updated
    const { isAdminAuthenticated, isStoreAuthenticated, isAuthenticated } =
      this.getAuthenticationDetails(node, oasPath)

    oas["x-authenticated"] = isAuthenticated
    oas.security = this.getSecurity({ isAdminAuthenticated, isAuthenticated })

    // update path parameters
    const newPathParameters = this.getPathParameters({ oasPath, tagName })
    oas.parameters = this.updateParameters({
      oldParameters: oas.parameters as OpenAPIV3.ParameterObject[],
      newParameters: newPathParameters,
      type: "path",
    })

    // retrieve updated query and request schemas
    const { queryParameters, requestSchema } = this.getRequestParameters({
      node,
      tagName,
      methodName,
    })

    // update query parameters
    oas.parameters = this.updateParameters({
      oldParameters: oas.parameters as OpenAPIV3.ParameterObject[],
      newParameters: queryParameters,
      type: "query",
    })

    // update request schema
    const existingRequestBodySchema = (
      oas.requestBody as OpenAPIV3.RequestBodyObject
    )?.content?.["application/json"].schema as OpenApiSchema
    const updatedRequestSchema = this.updateSchema({
      oldSchema: existingRequestBodySchema,
      newSchema: requestSchema,
    })

    if (!updatedRequestSchema) {
      // if there's no request schema, remove it from the OAS
      delete oas.requestBody
    } else {
      // update the schema
      oas.requestBody = {
        content: {
          "application/json": {
            schema:
              this.oasSchemaHelper.namedSchemaToReference(
                updatedRequestSchema
              ) ||
              this.oasSchemaHelper.schemaChildrenToRefs(updatedRequestSchema),
          },
        },
      }
    }

    // update response schema and status
    const newStatus = this.getResponseStatus(node)
    const newResponseSchema = this.getResponseSchema({
      node,
      tagName,
    })
    let updatedResponseSchema: OpenApiSchema | undefined

    if (!oas.responses && newResponseSchema) {
      // add response schema
      oas.responses = {
        [newStatus]: {
          description: "OK",
          content: {
            "application/json": {
              schema:
                this.oasSchemaHelper.namedSchemaToReference(
                  newResponseSchema
                ) ||
                this.oasSchemaHelper.schemaChildrenToRefs(newResponseSchema),
            },
          },
        },
        ...DEFAULT_OAS_RESPONSES,
      }
      updatedResponseSchema = newResponseSchema
    } else if (oas.responses && !newResponseSchema) {
      // remove response schema by only keeping the default responses
      oas.responses = DEFAULT_OAS_RESPONSES
    } else {
      // check if response status should be changed
      const oldResponseStatus = Object.keys(oas.responses!).find(
        (status) => !Object.keys(DEFAULT_OAS_RESPONSES).includes(status)
      )
      const oldResponseSchema = oldResponseStatus
        ? ((oas.responses![oldResponseStatus] as OpenAPIV3.ResponseObject)
            .content?.["application/json"].schema as OpenApiSchema)
        : undefined

      updatedResponseSchema = this.updateSchema({
        oldSchema: oldResponseSchema,
        newSchema: newResponseSchema,
      })

      if (oldResponseStatus && oldResponseSchema !== newStatus) {
        // delete the old response schema if its status is different
        delete oas.responses![oldResponseStatus]
      }

      // update the response schema
      oas.responses![newStatus] = {
        description: "OK",
        content: {
          "application/json": {
            schema: updatedResponseSchema
              ? this.oasSchemaHelper.namedSchemaToReference(
                  updatedResponseSchema
                ) ||
                this.oasSchemaHelper.schemaChildrenToRefs(updatedResponseSchema)
              : updatedResponseSchema,
          },
        },
      }
    }

    // update examples if the --generate-examples option is enabled
    if (this.options.generateExamples) {
      const oldJsExampleIndex = oas["x-codeSamples"]
        ? oas["x-codeSamples"].findIndex(
            (example) =>
              example.label ==
              OasExamplesGenerator.JSCLIENT_CODESAMPLE_DATA.label
          )
        : -1

      if (oldJsExampleIndex === -1) {
        // only generate a new example if it doesn't have an example
        const newJsExample = this.oasExamplesGenerator.generateJSClientExample({
          oasPath,
          httpMethod: methodName,
          area: splitOasPath[0] as OasArea,
          tag: tagName || "",
          isAdminAuthenticated,
          isStoreAuthenticated,
          parameters: (oas.parameters as OpenAPIV3.ParameterObject[])?.filter(
            (parameter) => parameter.in === "path"
          ),
          requestBody: updatedRequestSchema,
          responseBody: updatedResponseSchema,
        })

        oas["x-codeSamples"] = [
          ...(oas["x-codeSamples"] || []),
          {
            ...OasExamplesGenerator.JSCLIENT_CODESAMPLE_DATA,
            source: newJsExample,
          },
        ]
      }

      // TODO add for Medusa React once we figure out how to generate it
    }

    // check if cURL example should be updated.
    const oldCurlExampleIndex = oas["x-codeSamples"]
      ? oas["x-codeSamples"].findIndex(
          (example) =>
            example.label === OasExamplesGenerator.CURL_CODESAMPLE_DATA.label
        )
      : -1

    if (oldCurlExampleIndex === -1) {
      // only generate example if it doesn't already exist
      const newCurlExample = this.oasExamplesGenerator.generateCurlExample({
        method: methodName,
        path: normalizedOasPath,
        isAdminAuthenticated,
        isStoreAuthenticated,
        requestSchema,
      })
      oas["x-codeSamples"] = [
        ...(oas["x-codeSamples"] || []),
        {
          ...OasExamplesGenerator.CURL_CODESAMPLE_DATA,
          source: newCurlExample,
        },
      ]
    }

    // push new tags to the tags property
    if (tagName) {
      const areaTags = this.tags.get(splitOasPath[0] as OasArea)
      areaTags?.add(tagName)
    }

    return formatOas(oas, oasPrefix)
  }

  /**
   * Get the API route's path details.
   *
   * @param node - The node to retrieve its path details.
   * @returns The path details.
   */
  getOasPath(node: FunctionOrVariableNode): {
    /**
     * The path, generally left as-is, which helps detecting path parameters.
     */
    oasPath: string
    /**
     * The normalized path which adds a backslash at the beginning of the
     * oasPath and replaces path parameters of pattern `[paramName]` with
     * `{paramName}`. This can be used in the prefix line of the OAS.
     */
    normalized: string
  } {
    const filePath = node.getSourceFile().fileName
    const oasPath = filePath
      .substring(filePath.indexOf("/api/"))
      .replace(/^\/api\//, "")
      .replace(`/${basename(filePath)}`, "")
    const normalizedOasPath = `/${oasPath.replaceAll(
      API_ROUTE_PARAM_REGEX,
      `{$1}`
    )}`

    return {
      oasPath,
      normalized: normalizedOasPath,
    }
  }

  /**
   * Get the function's name, which is used to retrieve the HTTP method.
   *
   * @param node - The node to retrieve its function name.
   * @returns the name of the function.
   */
  getFunctionName(node: FunctionOrVariableNode): string {
    if (ts.isFunctionDeclaration(node)) {
      return node.name?.getText() || ""
    }

    return (
      node as ts.VariableStatement
    ).declarationList.declarations[0].name.getText()
  }

  /**
   * Retrieve the HTTP method of a node.
   *
   * @param node - The node to retrieve its HTTP method.
   * @returns The lowercase HTTP method name.
   */
  getHTTPMethodName(node: FunctionOrVariableNode): string {
    return this.getFunctionName(node).toLowerCase()
  }

  /**
   * Retrieve the OAS prefix line that's added before the YAML schema.
   *
   * @param methodName - The HTTP method name.
   * @param oasPath - The API route's path
   * @returns The OAS prefix line.
   */
  getOasPrefix(methodName: string, oasPath: string): string {
    return `@oas [${methodName}] ${oasPath}`
  }

  /**
   * Retrieve the tag name from the split OAS path.
   *
   * @param splitOasPath - The split OAS path.
   * @returns The tag name if available.
   */
  getTagName(splitOasPath: string[]): string | undefined {
    return splitOasPath.length >= 2 ? kebabToTitle(splitOasPath[1]) : undefined
  }

  /**
   * Retrieve the authentication details of a node.
   *
   * @param node - The node to retrieve its authentication details.
   * @param oasPath - The OAS path of the node.
   * @returns The authentication details.
   */
  getAuthenticationDetails(
    node: FunctionNode,
    oasPath: string
  ): {
    /**
     * Whether the OAS operation requires admin authentication.
     */
    isAdminAuthenticated: boolean
    /**
     * Whether the OAS operation requires customer authentication.
     */
    isStoreAuthenticated: boolean
    /**
     * Whether the OAS operation requires authentication in genral.
     */
    isAuthenticated: boolean
  } {
    const isAuthenticationDisabled = node
      .getSourceFile()
      .statements.some((statement) =>
        statement.getText().includes("AUTHENTICATE = false")
      )
    const isAdminAuthenticated =
      !isAuthenticationDisabled && oasPath.startsWith("admin")
    const isStoreAuthenticated =
      !isAuthenticationDisabled && oasPath.startsWith("store/customers/me")
    const isAuthenticated = isAdminAuthenticated || isStoreAuthenticated

    return {
      isAdminAuthenticated,
      isStoreAuthenticated,
      isAuthenticated,
    }
  }

  /**
   * Retrieve the OAS operation's ID.
   *
   * @param param0 - The OAS operation's details.
   * @returns The operation's ID.
   */
  getOperationId({
    methodName,
    splitOasPath,
  }: {
    /**
     * The HTTP method's name.
     */
    methodName: string
    /**
     * The split OAS path.
     */
    splitOasPath: string[]
  }): string {
    let str = capitalize(methodName)
    splitOasPath.slice(1).forEach((item) => {
      if (API_ROUTE_PARAM_REGEX.test(item)) {
        item = item.replace(API_ROUTE_PARAM_REGEX, "$1")
      }

      str += item
        .split("-")
        .map((subitem) => capitalize(subitem))
        .join("")
    })

    return str
  }

  /**
   * Retrieve the security details of an OAS operation.
   *
   * @param param0 - The authentication details.
   * @returns The security details.
   */
  getSecurity({
    isAdminAuthenticated,
    isAuthenticated,
  }: {
    /**
     * Whether the operation requires admin authentication.
     */
    isAdminAuthenticated: boolean
    /**
     * Whether the operation requires general authentication.
     */
    isAuthenticated: boolean
  }): OpenAPIV3.SecurityRequirementObject[] | undefined {
    const security: OpenAPIV3.SecurityRequirementObject[] = []
    if (isAdminAuthenticated) {
      security.push({
        api_token: [],
      })
    }
    if (isAuthenticated) {
      security.push(
        {
          cookie_auth: [],
        },
        {
          jwt_token: [],
        }
      )
    }

    return security.length ? security : undefined
  }

  /**
   * Format a schema as a parameter object. Can be used for path or query parameters.
   *
   * @param param0 - The operation's details.
   * @returns The parameter object.
   */
  getParameterObject({
    type,
    name,
    description,
    required,
    schema,
  }: {
    /**
     * The parameter type.
     */
    type: "path" | "query"
    /**
     * The name of the parameter.
     */
    name: string
    /**
     * Whether the parameter is required.
     */
    required: boolean
    /**
     * The parameter's description.
     */
    description?: string
    /**
     * The parameter's schema.
     */
    schema: OpenApiSchema
  }): OpenAPIV3.ParameterObject {
    return {
      name: name,
      in: type,
      description: description,
      required: required,
      schema: schema,
    }
  }

  /**
   * Retrieve the path parameters.
   *
   * @param param0 - The OAS operation's details.
   * @returns The list of path parameters.
   */
  getPathParameters({
    oasPath,
    tagName,
  }: {
    /**
     * The OAS path.
     */
    oasPath: string
    /**
     * The tag name.
     */
    tagName?: string
  }): OpenAPIV3.ParameterObject[] {
    // reset regex manually
    API_ROUTE_PARAM_REGEX.lastIndex = 0
    let pathParameters: string[] | undefined
    const parameters: OpenAPIV3.ParameterObject[] = []
    while (
      (pathParameters = API_ROUTE_PARAM_REGEX.exec(oasPath)?.slice(1)) !==
      undefined
    ) {
      if (pathParameters.length) {
        pathParameters.forEach((parameter) =>
          parameters.push(
            this.getParameterObject({
              type: "path",
              name: parameter,
              description: this.getSchemaDescription({
                typeStr: parameter,
                parentName: tagName,
              }),
              required: true,
              schema: {
                type: "string",
              },
            })
          )
        )
      }
    }

    return parameters
  }

  /**
   * Retrieve the request query parameters and body schema.
   *
   * @param param0 - The operation's details.
   * @returns The request query parameters and body schema.
   */
  getRequestParameters({
    node,
    tagName,
    methodName,
  }: {
    /**
     * The node to retrieve its request parameters.
     */
    node: FunctionNode
    /**
     * The HTTP method name of the function.
     */
    methodName: string
    /**
     * The tag's name.
     */
    tagName?: string
  }): {
    /**
     * The query parameters.
     */
    queryParameters: OpenAPIV3.ParameterObject[]
    /**
     * The request schema.
     */
    requestSchema?: OpenApiSchema
  } {
    const parameters: OpenAPIV3.ParameterObject[] = []
    let requestSchema: OpenApiSchema | undefined

    if (
      node.parameters[0].type &&
      ts.isTypeReferenceNode(node.parameters[0].type)
    ) {
      const requestType = this.checker.getTypeFromTypeNode(
        node.parameters[0].type
      ) as ts.TypeReference
      // TODO for now I'll use the type for validatedQuery until
      // we have an actual approach to infer query types
      const querySymbol = requestType.getProperty("validatedQuery")
      if (querySymbol) {
        const queryType = this.checker.getTypeOfSymbol(querySymbol)
        queryType.getProperties().forEach((property) => {
          const propertyType = this.checker.getTypeOfSymbol(property)
          const descriptionOptions: SchemaDescriptionOptions = {
            typeStr: property.getName(),
            parentName: tagName,
            node: property.valueDeclaration,
            symbol: property,
            nodeType: propertyType,
          }
          parameters.push(
            this.getParameterObject({
              name: property.getName(),
              type: "query",
              description: this.getSchemaDescription(descriptionOptions),
              required: this.isRequired(property),
              schema: this.typeToSchema({
                itemType: propertyType,
                title: property.getName(),
                descriptionOptions,
              }),
            })
          )
        })
      }

      const requestTypeArguments = this.checker.getTypeArguments(requestType)

      if (requestTypeArguments.length === 1) {
        const zodObjectTypeName = getCorrectZodTypeName({
          typeReferenceNode: node.parameters[0].type,
          itemType: requestTypeArguments[0],
        })
        const parameterSchema = this.typeToSchema({
          itemType: requestTypeArguments[0],
          descriptionOptions: {
            parentName: tagName,
          },
          zodObjectTypeName: zodObjectTypeName,
        })

        // If function is a GET function, add the type parameter to the
        // query parameters instead of request parameters.
        if (methodName === "get") {
          if (parameterSchema.type === "object" && parameterSchema.properties) {
            Object.entries(parameterSchema.properties).forEach(
              ([key, propertySchema]) => {
                if ("$ref" in propertySchema) {
                  return
                }

                // check if parameter is already added
                const isAdded = parameters.some((param) => param.name === key)

                if (isAdded) {
                  return
                }

                parameters.push(
                  this.getParameterObject({
                    name: key,
                    type: "query",
                    description: propertySchema.description,
                    required: parameterSchema.required?.includes(key) || false,
                    schema: propertySchema,
                  })
                )
              }
            )
          }
        } else if (methodName !== "delete") {
          requestSchema = parameterSchema
        }
      }
    }

    return {
      queryParameters: parameters,
      requestSchema,
    }
  }

  /**
   * Retrieve the response's status.
   *
   * @param node - The node to retrieve its response status.
   * @returns The response's status.
   */
  getResponseStatus(node: FunctionNode): string {
    let responseStatus = "200"
    if ("body" in node && node.body && "statements" in node.body) {
      node.body.statements.forEach((statement) => {
        const matched = RES_STATUS_REGEX.exec(statement.getText())?.splice(1)
        if (matched?.length === 1) {
          responseStatus = matched[0]
        }
      })
    }

    return responseStatus
  }

  /**
   * Retrieve the response schema of the OAS operation.
   *
   * @param param0 - The OAS operation's details.
   * @returns The response schema.
   */
  getResponseSchema({
    node,
    tagName,
  }: {
    /**
     * The node to retrieve its response schema.
     */
    node: FunctionNode
    /**
     * The tag's name.
     */
    tagName?: string
  }): OpenApiSchema | undefined {
    let responseSchema: OpenApiSchema | undefined

    if (
      node.parameters[1].type &&
      ts.isTypeReferenceNode(node.parameters[1].type)
    ) {
      const responseType = this.checker.getTypeFromTypeNode(
        node.parameters[1].type
      ) as ts.TypeReference
      const responseTypeArguments =
        responseType.aliasTypeArguments ||
        this.checker.getTypeArguments(responseType)

      if (responseTypeArguments.length === 1) {
        responseSchema = this.typeToSchema({
          itemType: responseTypeArguments[0],
          descriptionOptions: {
            parentName: tagName,
          },
          zodObjectTypeName: getCorrectZodTypeName({
            typeReferenceNode: node.parameters[1].type,
            itemType: responseTypeArguments[0],
          }),
        })
      }
    }

    return responseSchema
  }

  /**
   * Convert a TypeScript type to a schema object.
   *
   * @param param0 - The type and additional details.
   * @returns The schema object.
   */
  typeToSchema({
    itemType,
    level = 1,
    title,
    descriptionOptions,
    allowedChildren,
    disallowedChildren,
    zodObjectTypeName,
  }: {
    /**
     * The TypeScript type.
     */
    itemType: ts.Type
    /**
     * The current level. Used to limit the recursive loop.
     */
    level?: number
    /**
     * The type's title, if available.
     */
    title?: string
    /**
     * options to retrieve a parameter/property's description.
     */
    descriptionOptions?: Partial<SchemaDescriptionOptions>
    /**
     * Children that can be allowed to retrieve. If this property is supplied,
     * only children in this array are added to the returned schema.
     */
    allowedChildren?: string[]
    /**
     * Children that aren't allowed to retrieve. If this property is supplied,
     * only children not included in this array are added to the schema.
     */
    disallowedChildren?: string[]
    /**
     * By default, the type name is generated from itemType, which
     * doesn't work for types created by Zod. This allows to correct the
     * generated type name.
     */
    zodObjectTypeName?: string
  }): OpenApiSchema {
    if (level > this.MAX_LEVEL) {
      return {}
    }

    const symbol = itemType.aliasSymbol || itemType.symbol
    const description = descriptionOptions?.typeStr
      ? this.getSchemaDescription(
          descriptionOptions as SchemaDescriptionOptions
        )
      : title
        ? this.getSchemaDescription({ typeStr: title, nodeType: itemType })
        : SUMMARY_PLACEHOLDER
    const typeAsString =
      zodObjectTypeName || this.checker.typeToString(itemType)

    const schemaFromFactory = this.schemaFactory.tryGetSchema(
      itemType.symbol?.getName() ||
        itemType.aliasSymbol?.getName() ||
        title ||
        typeAsString,
      {
        title: title || typeAsString,
        description,
      }
    )

    if (schemaFromFactory) {
      return schemaFromFactory
    }

    switch (true) {
      case itemType.flags === ts.TypeFlags.Enum:
        const enumMembers: string[] = []
        symbol?.members?.forEach((enumMember) => {
          if ((enumMember.valueDeclaration as ts.EnumMember).initializer) {
            enumMembers.push(
              (
                enumMember.valueDeclaration as ts.EnumMember
              ).initializer!.getText()
            )
          }
        })
        return {
          type: "string",
          enum: enumMembers,
        }
      case itemType.isLiteral():
        return {
          type:
            itemType.flags === ts.TypeFlags.StringLiteral
              ? "string"
              : itemType.flags === ts.TypeFlags.NumberLiteral
                ? "number"
                : "boolean",
          title: title || typeAsString,
          description,
          format: this.getSchemaTypeFormat({
            typeName: typeAsString,
            name: title,
          }),
        }
      case itemType.flags === ts.TypeFlags.String ||
        itemType.flags === ts.TypeFlags.Number ||
        itemType.flags === ts.TypeFlags.Boolean ||
        typeAsString === "Date":
        return {
          type:
            typeAsString === "Date"
              ? "string"
              : (typeAsString as OpenAPIV3.NonArraySchemaObjectType),
          title: title || typeAsString,
          description,
          default: symbol?.valueDeclaration
            ? this.getDefaultValue(symbol?.valueDeclaration)
            : undefined,
          format: this.getSchemaTypeFormat({
            typeName: typeAsString,
            name: title,
          }),
        }
      case "intrinsicName" in itemType && itemType.intrinsicName === "boolean":
        return {
          type: "boolean",
          title: title || typeAsString,
          description,
          default: symbol?.valueDeclaration
            ? this.getDefaultValue(symbol?.valueDeclaration)
            : undefined,
        }
      case this.checker.isArrayType(itemType):
        return {
          type: "array",
          description,
          items: this.typeToSchema({
            itemType: this.checker.getTypeArguments(
              itemType as ts.TypeReference
            )[0],
            // can't increment level because
            // array must have items in it
            level,
            title,
            descriptionOptions:
              descriptionOptions || title
                ? {
                    ...descriptionOptions,
                    parentName: title || descriptionOptions?.parentName,
                  }
                : undefined,
          }),
        }
      case itemType.isUnion():
        // if it's a union of literal types,
        // consider it an enum
        const allLiteral = (itemType as ts.UnionType).types.every((unionType) =>
          unionType.isLiteral()
        )
        if (allLiteral) {
          return {
            type: "string",
            enum: (itemType as ts.UnionType).types.map(
              (unionType) => (unionType as ts.LiteralType).value
            ),
          }
        }
        return {
          oneOf: (itemType as ts.UnionType).types.map((unionType) =>
            this.typeToSchema({
              itemType: unionType,
              // not incrementing considering the
              // current schema isn't actually a
              // schema
              level,
              title,
              descriptionOptions,
            })
          ),
        }
      case itemType.isIntersection():
        return {
          allOf: (itemType as ts.IntersectionType).types.map(
            (intersectionType) => {
              return this.typeToSchema({
                itemType: intersectionType,
                // not incrementing considering the
                // current schema isn't actually a
                // schema
                level,
                title,
                descriptionOptions,
              })
            }
          ),
        }
      case typeAsString.startsWith("Pick"):
        const pickTypeArgs =
          itemType.aliasTypeArguments ||
          this.checker.getTypeArguments(itemType as ts.TypeReference)

        if (pickTypeArgs.length < 2) {
          return {}
        }
        const pickedProperties = pickTypeArgs[1].isUnion()
          ? pickTypeArgs[1].types.map((unionType) =>
              this.getTypeName(unionType)
            )
          : [this.getTypeName(pickTypeArgs[1])]
        return this.typeToSchema({
          itemType: pickTypeArgs[0],
          title,
          level,
          descriptionOptions,
          allowedChildren: pickedProperties,
        })
      case typeAsString.startsWith("Omit"):
        const omitTypeArgs =
          itemType.aliasTypeArguments ||
          this.checker.getTypeArguments(itemType as ts.TypeReference)

        if (omitTypeArgs.length < 2) {
          return {}
        }
        const omitProperties = omitTypeArgs[1].isUnion()
          ? omitTypeArgs[1].types.map((unionType) =>
              this.getTypeName(unionType)
            )
          : [this.getTypeName(omitTypeArgs[1])]
        return this.typeToSchema({
          itemType: omitTypeArgs[0],
          title,
          level,
          descriptionOptions,
          disallowedChildren: omitProperties,
        })
      case typeAsString.startsWith("Partial"):
        const typeArg =
          itemType.aliasTypeArguments ||
          this.checker.getTypeArguments(itemType as ts.TypeReference)
        if (!typeArg.length) {
          return {}
        }

        const schema = this.typeToSchema({
          itemType: typeArg[0],
          title,
          level,
          descriptionOptions,
          disallowedChildren,
          allowedChildren,
        })

        // remove all required items
        delete schema.required

        return schema
      case itemType.isClassOrInterface() ||
        itemType.isTypeParameter() ||
        (itemType as ts.Type).flags === ts.TypeFlags.Object:
        const properties: Record<string, OpenApiSchema> = {}
        const requiredProperties: string[] = []

        const baseType = itemType.getBaseTypes()?.[0]
        const isDeleteResponse =
          baseType?.aliasSymbol?.getEscapedName() === "DeleteResponse"

        if (level + 1 <= this.MAX_LEVEL) {
          itemType.getProperties().forEach((property) => {
            if (
              (allowedChildren && !allowedChildren.includes(property.name)) ||
              (disallowedChildren && disallowedChildren.includes(property.name))
            ) {
              return
            }
            if (this.isRequired(property)) {
              requiredProperties.push(property.name)
            }
            properties[property.name] = this.typeToSchema({
              itemType: this.checker.getTypeOfSymbol(property),
              level: level + 1,
              title: property.name,
              descriptionOptions: {
                ...descriptionOptions,
                typeStr: property.name,
                parentName: title || descriptionOptions?.parentName,
              },
            })

            if (isDeleteResponse && property.name === "object") {
              // try to retrieve default from `DeleteResponse`'s type argument
              const deleteTypeArg = baseType.aliasTypeArguments?.[0]
              properties[property.name].default =
                deleteTypeArg && "value" in deleteTypeArg
                  ? (deleteTypeArg.value as string)
                  : properties[property.name].default
            }
          })
        }

        const objSchema: OpenApiSchema = {
          type: "object",
          description,
          "x-schemaName":
            itemType.isClassOrInterface() ||
            itemType.isTypeParameter() ||
            (isZodObject(itemType) && zodObjectTypeName)
              ? this.oasSchemaHelper.normalizeSchemaName(typeAsString)
              : undefined,
          required:
            requiredProperties.length > 0 ? requiredProperties : undefined,
        }

        if (Object.values(properties).length) {
          objSchema.properties = properties
        }

        if (objSchema["x-schemaName"]) {
          // add object to schemas to be created
          // if necessary
          this.oasSchemaHelper.namedSchemaToReference(objSchema)
        }

        return objSchema
      default:
        return {}
    }
  }

  /**
   * Retrieve the description of a symbol, type, or node. Can be used to retrieve
   * the description of a property or parameter in a schema.
   *
   * @param param0 - The details of the item to retrieve its description.
   * @returns The description.
   */
  getSchemaDescription({
    symbol,
    node,
    nodeType,
    typeStr,
    parentName,
  }: SchemaDescriptionOptions): string {
    if (!symbol && !node && !nodeType) {
      // if none of the associated symbol, node, or type are provided,
      // either retrieve the description from the knowledge base or use
      // the default summary
      return (
        this.knowledgeBaseFactory.tryToGetOasSchemaDescription({
          str: typeStr,
          templateOptions: {
            parentName,
          },
        }) || SUMMARY_PLACEHOLDER
      )
    }

    if (node) {
      return this.getNodeSummary({
        node: node,
        symbol,
        nodeType,
      })
    }

    let description = ""

    if (nodeType) {
      description = this.getTypeDocBlock(nodeType)
    }

    if (!description.length && symbol) {
      description = this.getSymbolDocBlock(symbol)
    }

    return description.length ? description : SUMMARY_PLACEHOLDER
  }

  /**
   * Check whether a symbol is required.
   *
   * @param symbol - The symbol to check.
   * @param level - The current recursion level to avoid max-stack error
   * @returns Whether the symbol is required.
   */
  isRequired(symbol: ts.Symbol, level = 0): boolean {
    let isRequired = true
    const checkNode = (node: ts.Node) => {
      switch (node.kind) {
        case ts.SyntaxKind.CallExpression:
          const expression =
            "expression" in node
              ? (node.expression as ts.Expression)
              : undefined

          if (!expression || !("name" in expression)) {
            break
          }

          isRequired =
            (expression.name as ts.Identifier).getText() !== "optional"
          break
        case ts.SyntaxKind.QuestionToken:
          isRequired = false
      }

      if (!isRequired) {
        return
      }

      node.forEachChild(checkNode)
    }
    if (
      !symbol.valueDeclaration &&
      symbol.declarations?.length &&
      "symbol" in symbol.declarations[0] &&
      level < this.MAX_LEVEL
    ) {
      return this.isRequired(
        symbol.declarations[0].symbol as ts.Symbol,
        level + 1
      )
    }

    ;(symbol.valueDeclaration || symbol.declarations?.[0])?.forEachChild(
      checkNode
    )

    return isRequired
  }

  /**
   * Retrieve the format of a property/parameter in a schema.
   *
   * @param param0 - The item's details.
   * @returns The format, if available.
   */
  getSchemaTypeFormat({
    typeName,
    name,
  }: {
    typeName: string
    name?: string
  }): string | undefined {
    switch (true) {
      case typeName === "Date":
        return "date-time"
      case name?.includes("email"):
        return "email"
      case name?.includes("password"):
        return "password"
    }
  }

  /**
   * Retrieve the name of a type. This is useful when retrieving allowed/disallowed
   * properties in an Omit/Pick type.
   *
   * @param itemType - The type to retrieve its name.
   * @returns The type's name.
   */
  getTypeName(itemType: ts.Type): string {
    if (itemType.symbol || itemType.aliasSymbol) {
      return (itemType.aliasSymbol || itemType.symbol).name
    }

    if (itemType.isLiteral()) {
      return itemType.value.toString()
    }

    return this.checker.typeToString(itemType)
  }

  /**
   * Initialize the {@link tags} property.
   */
  init() {
    this.tags.set("admin", new Set())
    this.tags.set("store", new Set())
  }

  /**
   * Update an array of parameters with a new one.
   *
   * @param param0 - The parameter details.
   * @returns The updated parameters.
   */
  updateParameters({
    oldParameters,
    newParameters,
    type,
  }: {
    /**
     * The old list of parameters.
     */
    oldParameters?: OpenAPIV3.ParameterObject[]
    /**
     * The new list of parameters.
     */
    newParameters?: OpenAPIV3.ParameterObject[]
    /**
     * The type of parameters.
     */
    type: ParameterType
  }): OpenAPIV3.ParameterObject[] {
    if (!oldParameters) {
      return newParameters || []
    }
    const oppositeParamType = type === "query" ? "path" : "query"
    const oppositeParams: OpenAPIV3.ParameterObject[] =
      oldParameters?.filter((param) => param.in === oppositeParamType) || []
    // check and update/add parameters if necessary
    const existingParams: OpenAPIV3.ParameterObject[] =
      oldParameters?.filter((param) => param.in === type) || []
    const paramsToRemove = new Set<string>()

    existingParams.forEach((parameter) => {
      const updatedParameter = newParameters?.find(
        (newParam) => newParam.name === parameter.name
      )
      if (!updatedParameter) {
        // remove the parameter
        paramsToRemove.add(parameter.name)
        return
      }

      if (
        updatedParameter.description !== parameter.description &&
        parameter.description === SUMMARY_PLACEHOLDER
      ) {
        parameter.description = updatedParameter.description
      }

      if (updatedParameter.required !== parameter.required) {
        parameter.required = updatedParameter.required
      }

      if (
        (updatedParameter.schema as OpenApiSchema).type !==
        (parameter.schema as OpenApiSchema).type
      ) {
        ;(parameter.schema as OpenApiSchema).type = (
          updatedParameter.schema as OpenApiSchema
        ).type
      }

      if (
        (updatedParameter.schema as OpenApiSchema).title !==
        (parameter.schema as OpenApiSchema).title
      ) {
        ;(parameter.schema as OpenApiSchema).title = (
          updatedParameter.schema as OpenApiSchema
        ).title
      }

      if (
        (updatedParameter.schema as OpenApiSchema).description !==
          (parameter.schema as OpenApiSchema).description &&
        (parameter.schema as OpenApiSchema).description === SUMMARY_PLACEHOLDER
      ) {
        ;(parameter.schema as OpenApiSchema).description = (
          updatedParameter.schema as OpenApiSchema
        ).description
      }
    })

    // find new parameters to add
    newParameters?.forEach((parameter) => {
      if (existingParams.some((newParam) => newParam.name === parameter.name)) {
        return
      }

      existingParams?.push(parameter)
    })

    // remove parameters no longer existing
    return [
      ...oppositeParams,
      ...(existingParams?.filter(
        (parameter) =>
          (parameter as OpenAPIV3.ParameterObject).in === oppositeParamType ||
          !paramsToRemove.has((parameter as OpenAPIV3.ParameterObject).name)
      ) || []),
    ]
  }

  /**
   * Retrieve the updated schema. Can be used for request and response schemas.
   *
   * @param param0 - The schema details.
   * @returns The updated schema.
   */
  updateSchema({
    oldSchema,
    newSchema,
    level = 1,
  }: {
    /**
     * The old schema.
     */
    oldSchema?: OpenApiSchema | OpenAPIV3.ReferenceObject
    /**
     * The new schema.
     */
    newSchema?: OpenApiSchema | OpenAPIV3.ReferenceObject
    /**
     * The current level in the update schema. Used to avoid
     * maximum call stack size exceeded error
     */
    level?: number
  }): OpenApiSchema | undefined {
    if (level > this.MAX_LEVEL) {
      return
    }

    const oldSchemaObj = (
      oldSchema && "$ref" in oldSchema
        ? this.oasSchemaHelper.getSchemaByName(oldSchema.$ref)?.schema
        : oldSchema
    ) as OpenApiSchema | undefined
    const newSchemaObj = (
      newSchema && "$ref" in newSchema
        ? this.oasSchemaHelper.getSchemaByName(newSchema.$ref)?.schema
        : newSchema
    ) as OpenApiSchema | undefined

    if (!oldSchemaObj && newSchemaObj) {
      return newSchemaObj
    } else if (!newSchemaObj) {
      return undefined
    }

    // update schema
    if (oldSchemaObj!.type !== newSchemaObj?.type) {
      oldSchemaObj!.type = newSchemaObj?.type
    }

    if (
      oldSchemaObj!.description !== newSchemaObj?.description &&
      oldSchemaObj!.description === SUMMARY_PLACEHOLDER
    ) {
      oldSchemaObj!.description =
        newSchemaObj?.description || SUMMARY_PLACEHOLDER
    }

    oldSchemaObj!.required = newSchemaObj?.required
    oldSchemaObj!["x-schemaName"] = newSchemaObj?.["x-schemaName"]

    if (oldSchemaObj!.type === "object") {
      if (!oldSchemaObj?.properties && newSchemaObj?.properties) {
        oldSchemaObj!.properties = newSchemaObj.properties
      } else if (!newSchemaObj?.properties) {
        delete oldSchemaObj!.properties
      } else {
        // update existing properties
        Object.entries(oldSchemaObj!.properties!).forEach(
          ([propertyName, propertySchema]) => {
            const newPropertySchemaKey = Object.keys(
              newSchemaObj!.properties!
            ).find((newPropertyName) => newPropertyName === propertyName)
            if (!newPropertySchemaKey) {
              // remove property
              delete oldSchemaObj!.properties![propertyName]
              return
            }

            oldSchemaObj!.properties![propertyName] =
              this.updateSchema({
                oldSchema: propertySchema as OpenApiSchema,
                newSchema: newSchemaObj!.properties![
                  propertyName
                ] as OpenApiSchema,
                level: level + 1,
              }) || propertySchema
          }
        )
        // add new properties
        Object.keys(newSchemaObj!.properties!)
          .filter(
            (propertyKey) =>
              !Object.hasOwn(oldSchemaObj!.properties!, propertyKey)
          )
          .forEach((newPropertyKey) => {
            oldSchemaObj!.properties![newPropertyKey] =
              newSchemaObj!.properties![newPropertyKey]
          })
      }
    } else if (
      oldSchemaObj?.type === "array" &&
      newSchemaObj?.type === "array"
    ) {
      oldSchemaObj.items =
        this.updateSchema({
          oldSchema: oldSchemaObj.items as OpenApiSchema,
          newSchema: newSchemaObj!.items as OpenApiSchema,
          level: level + 1,
        }) || oldSchemaObj.items
    }

    return oldSchemaObj
  }

  /**
   * Retrieve the file name that's used to write the OAS operation of a node.
   *
   * @param node - The node to retrieve its associated file name.
   * @returns The file name.
   */
  getAssociatedFileName(node: FunctionOrVariableNode): string {
    const methodName = this.getHTTPMethodName(node)
    const { oasPath } = this.getOasPath(node)
    const area = oasPath.split("/")[0]

    const filename = `${methodName}_${oasPath.replaceAll("/", "_")}.ts`

    return join(this.baseOutputPath, "operations", area, filename)
  }

  /**
   * This method is executed when the {@link GeneratorEvent.FINISHED_GENERATE_EVENT} event is triggered.
   * It writes new tags, if available, in base YAML.
   */
  afterGenerate() {
    this.writeNewTags("admin")
    this.writeNewTags("store")
    this.oasSchemaHelper.writeNewSchemas()

    // reset tags
    this.init()
    // reset schemas
    this.oasSchemaHelper.init()
  }

  /**
   * Add new tags to the base YAML of an area.
   *
   * @param area - The area that the tag belongs to.
   */
  writeNewTags(area: OasArea) {
    // load base oas files
    const areaYamlPath = join(
      this.baseOutputPath,
      "base",
      `${area}.oas.base.yaml`
    )
    const areaYaml = parse(
      readFileSync(areaYamlPath, "utf-8")
    ) as OpenApiDocument
    let modifiedTags = false

    areaYaml.tags = [...(areaYaml.tags || [])]

    this.tags.get(area)?.forEach((tag) => {
      const existingTag = areaYaml.tags!.find((baseTag) => baseTag.name === tag)
      const schemaName = this.oasSchemaHelper.tagNameToSchemaName(tag, area)
      const schema = this.oasSchemaHelper.getSchemaByName(schemaName, false)
      const associatedSchema = schema?.schema?.["x-schemaName"]
        ? {
            $ref: this.oasSchemaHelper.constructSchemaReference(
              schema.schema["x-schemaName"]
            ),
          }
        : undefined
      if (!existingTag) {
        areaYaml.tags!.push({
          name: tag,
          "x-associatedSchema": associatedSchema,
        })
        modifiedTags = true
      } else if (
        existingTag["x-associatedSchema"]?.$ref !== associatedSchema?.$ref
      ) {
        existingTag["x-associatedSchema"] = associatedSchema
        modifiedTags = true
      }
    })

    if (modifiedTags) {
      // sort alphabetically
      areaYaml.tags.sort((tagA, tagB) => {
        return tagA.name.localeCompare(tagB.name)
      })
      // write to the file
      writeFileSync(areaYamlPath, stringify(areaYaml))
    }
  }
}

export default OasKindGenerator
