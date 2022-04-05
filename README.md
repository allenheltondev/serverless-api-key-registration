# Microservice API Key Registration

This repository is intended to be used as a template for adding API key registration to a microservice. It can be deployed into the same AWS account multiple times to enable consumers to register for multiple microservices that live in the same account.

## Benchmarking

There are three endpoints in this API that functionally perform the same operation, but are built with different mechanisms for performance comparisons.

* `/api-keys` - Uses an express workflow in Step Functions
* `/v2/api-keys` - Uses a Lambda function with v2 of the AWS SDK
* `/v3/api-keys` - Uses a Lambda function with v3 of the AWS SDK

## Why Is This Necessary?

All APIs, even proof of concepts, need to be secured. This template provides an easy way to implement security on everything in a repeatable manner. 

When you create a new project that includes an API, deploy this stack into the same AWS account with the new API Id and Stage name as deployment parameters and you will be automatically setup with a way to register an API key.

## How to Deploy This Stack

To deploy this stack into your account, you can use the [SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html) to build and deploy your resources. To prepare the repository for deployment, you must run the following commands:

```
sam build
sam deploy --guided
```

The `--guided` flag will walk you through a setup to configure a `samconfig.toml` file. It will prompt you for values for the deployment parameters.

### Deployment Parameter Cheat Sheet

* **ApiId** - This is the identifier for the internal API that will have the API key generated. This can be found in the [API Gateway console](https://console.aws.amazon.com/apigateway)
* **ApiStageName** - This is the environment type, i.e. *dev* or *prod*
* **ApiName** - Friendly name of the microservice you are deploying this stack for. This is for display only in the AWS console
* **DynamoDBTableName** - Name of the DynamoDB table used in the microservice. i.e. *gopherholes*
* **DynamoTableCMKPolicyArn** - If the DynamoDB table is protected by a KMS Key, provide the arn of the Managed Policy that enables decryption of the key
* **DomainName** - If you want to put a custom domain name on this API, enter the base domain name here. This must map to a custom domain that already exists in API Gateway. i.e. *api.gopherholesunlimited.com*
* **BasePath** - If you want to put a custom domain name on this API, enter the base-path to use. i.e. *registrations*

## What is Deployed In This Stack?

This stack will deploy an API and backing endpoint resources to allow a user to register for an API key. It uses Step Functions to perform the big tasks like registering a new key, deleting a key, and rotation. 

For most of the other operations in the API, direct DynamoDB integrations are performed to return data. It uses VTL to query and transform data directly.

## Setup For Other APIs

If you wish to setup your APIs to implement this API key registration approach, take a look at my reference application [Gopher Holes Unlimited](https://github.com/allenheltondev/gopher-holes-unlimited). It has an API that requires an API Key for authentication.