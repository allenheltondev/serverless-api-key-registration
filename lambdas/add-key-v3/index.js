const { StatusCodes } = require('http-status-codes');
const { APIGatewayClient, CreateUsagePlanCommand, CreateApiKeyCommand, DeleteUsagePlanCommand, DeleteApiKeyCommand,
  CreateUsagePlanKeyCommand, DeleteUsagePlanKeyCommand, UpdateUsagePlanCommand } = require('@aws-sdk/client-api-gateway');
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall, unmarshall } = require('@aws-sdk/util-dynamodb');

const ddb = new DynamoDBClient();
const apig = new APIGatewayClient();

exports.handler = async (event) => {
  const body = JSON.parse(event.body);
  const existingKey = await exports.getExistingKey(body.name);
  if (existingKey) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      body: JSON.stringify({ message: 'An API key with the provided name is already registered' }),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }

  const [usagePlanId, apiKey] = await Promise.all([
    exports.createUsagePlan(body.name),
    exports.createApiKey(body.name)
  ]);

  if (!usagePlanId && apiKey) {
    await exports.deleteApiKey(apiKey.id);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: 'Something went wrong' }),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }

  if (usagePlanId && !apiKey) {
    await exports.deleteUsagePlan(usagePlanId);
    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: 'Something went wrong' }),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }

  const usagePlanKeyId = await exports.linkApiKeyToUsagePlan(usagePlanId, apiKey.id);
  if (!usagePlanKeyId) {
    await Promise.all([
      exports.deleteApiKey(apiKey.id),
      exports.deleteUsagePlan(usagePlanId)
    ]);

    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: 'Something went wrong' }),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }

  const success = await exports.saveApiKeyToDatabase(body.name, usagePlanId, apiKey.id, usagePlanKeyId);
  if (!success) {
    await Promise.all([
      exports.deleteUsagePlanKey(usagePlanId, apiKey.id),
      exports.deleteUsagePlan(usagePlanId),
      exports.deleteApiKey(apiKey.id)
    ]);

    return {
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
      body: JSON.stringify({ message: 'Something went wrong' }),
      headers: { 'Access-Control-Allow-Origin': '*' }
    };
  }

  return {
    statusCode: StatusCodes.CREATED,
    body: JSON.stringify({ apiKey: apiKey.value }),
    headers: { 'Access-Control-Allow-Origin': '*' }
  };
};

exports.getExistingKey = async (name) => {
  const command = new GetItemCommand({
    TableName: process.env.TABLE_NAME,
    Key: marshall({
      pk: 'apikey#',
      sk: name
    })
  });

  const result = await ddb.send(command);
  if (result?.Item) {
    return unmarshall(result.Item);
  }
};

exports.createUsagePlan = async (name) => {
  try {
    const command = new CreateUsagePlanCommand({
      name: name,
      apiStages: [
        {
          apiId: process.env.API_ID,
          stage: process.env.STAGE
        }
      ]
    });

    const usagePlan = await apig.send(command);
    return usagePlan.id;
  } catch (err) {
    console.error(err);
  }
};

exports.createApiKey = async (name) => {
  try {
    const command = new CreateApiKeyCommand({
      enabled: true,
      name: `${name}-${process.env.API_ID}`
    });

    const result = await apig.send(command);
    return {
      id: result.id,
      value: result.value
    };
  } catch (err) {
    console.error(err);
  }
};

exports.deleteApiKey = async (apiKeyId) => {
  try {
    const command = new DeleteApiKeyCommand({
      apiKey: apiKeyId
    });

    await apig.send(command);
  } catch (err) {
    console.error(err);
  }
};

exports.deleteUsagePlan = async (usagePlanId) => {
  try {
    const updateUsagePlanCommand = new UpdateUsagePlanCommand({
      usagePlanId: usagePlanId,
      patchOperations: [
        {
          op: 'remove',
          path: '/apiStages',
          value: `${process.env.API_ID}:${process.env.STAGE}`
        }
      ]
    });

    await apig.send(updateUsagePlanCommand);

    const deleteUsagePlanCommand = new DeleteUsagePlanCommand({
      usagePlanId: usagePlanId``
    });

    await apig.send(deleteUsagePlanCommand);
  } catch (err) {
    console.error(err);
  }
};

exports.linkApiKeyToUsagePlan = async (usagePlanId, apiKeyId) => {
  try {
    const command = new CreateUsagePlanKeyCommand({
      keyId: apiKeyId,
      keyType: 'API_KEY',
      usagePlanId: usagePlanId
    });

    const response = await apig.send(command);
    return response.id;
  } catch (err) {
    console.error(err);
  }
};

exports.saveApiKeyToDatabase = async (name, usagePlanId, apiKeyId, usagePlanKeyId) => {
  try {
    const command = new PutItemCommand({
      TableName: process.env.TABLE_NAME,
      Item: marshall({
        pk: 'apikey#',
        sk: name,
        keyParts: {
          name: name
        },
        data: {
          apiKeyId,
          usagePlanId,
          usagePlanKeyId
        },
        facet: 'api-key',
        audit: {
          created: {
            timestamp: new Date().toISOString()
          }
        }
      })
    });

    await ddb.send(command);
    return true;
  } catch (err) {
    console.error(err);
  }
};

exports.deleteUsagePlanKey = async (usagePlanId, apiKeyId) => {
  try {
    const command = new DeleteUsagePlanKeyCommand({
      keyId: apiKeyId,
      usagePlanId: usagePlanId
    });

    await apig.send(command);
  } catch (err) {
    console.error(err);
  }
};