const { StatusCodes } = require('http-status-codes');
const DynamoDB = require('aws-sdk/clients/dynamodb');
const ApiGateway = require('aws-sdk/clients/apigateway');

const ddb = new DynamoDB.DocumentClient();
;
const apig = new ApiGateway();

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
  const params = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: 'apikey#',
      sk: name
    }
  };

  const result = await ddb.get(params).promise();
  if (result?.Item) {
    return result.Item;
  }
};

exports.createUsagePlan = async (name) => {
  try {
    const params = {
      name: name,
      apiStages: [
        {
          apiId: process.env.API_ID,
          stage: process.env.STAGE
        }
      ]
    };

    const usagePlan = await apig.createUsagePlan(params).promise();
    return usagePlan.id;
  } catch (err) {
    console.error(err);
  }
};

exports.createApiKey = async (name) => {
  try {
    const params = {
      enabled: true,
      name: `${name}-${process.env.API_ID}`
    };

    const result = await apig.createApiKey(params).promise();
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
    const params = {
      apiKey: apiKeyId
    };

    await apig.deleteApiKey(params).promise();
  } catch (err) {
    console.error(err);
  }
};

exports.deleteUsagePlan = async (usagePlanId) => {
  try {
    let params = {
      usagePlanId: usagePlanId,
      patchOperations: [
        {
          op: 'remove',
          path: '/apiStages',
          value: `${process.env.API_ID}:${process.env.STAGE}`
        }
      ]
    };

    await apig.updateUsagePlan(params).promise();

    params = {
      usagePlanId: usagePlanId``
    };

    await apig.deleteUsagePlan(params).promise();
  } catch (err) {
    console.error(err);
  }
};

exports.linkApiKeyToUsagePlan = async (usagePlanId, apiKeyId) => {
  try {
    const params = {
      keyId: apiKeyId,
      keyType: 'API_KEY',
      usagePlanId: usagePlanId
    };

    const response = await apig.createUsagePlanKey(params).promise();
    return response.id;
  } catch (err) {
    console.error(err);
  }
};

exports.saveApiKeyToDatabase = async (name, usagePlanId, apiKeyId, usagePlanKeyId) => {
  try {
    const params = {
      TableName: process.env.TABLE_NAME,
      Item: {
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
      }
    };

    await ddb.put(params).promise();
    return true;
  } catch (err) {
    console.error(err);
  }
};

exports.deleteUsagePlanKey = async (usagePlanId, apiKeyId) => {
  try {
    const params = {
      keyId: apiKeyId,
      usagePlanId: usagePlanId
    };

    await apig.deleteUsagePlanKey(params).promise();
  } catch (err) {
    console.error(err);
  }
};