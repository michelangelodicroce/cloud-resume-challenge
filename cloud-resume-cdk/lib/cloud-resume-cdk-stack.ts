import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ssm from 'aws-cdk-lib/aws-ssm';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class CloudResumeCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create S3 bucket
    const websiteBucket = new s3.Bucket(this, 'cloud-resume-bucket', {
      websiteIndexDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(websiteBucket, {
      originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST,],
    });

    // Get certificate ARN from SSM Parameter Store
    const certificateArn = ssm.StringParameter.valueForStringParameter(
      this,
      '/cloud-resume/certificate-arn'
    );

    // Get domain name from SSM
    const domainName = ssm.StringParameter.valueForStringParameter(
      this,
      '/cloud-resume/domain-name'
    );

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'cloud-resume-distribution', {
      defaultBehavior: { 
        origin: s3Origin, 
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS 
      },
      defaultRootObject: 'index.html',
      domainNames: [domainName],
      certificate: acm.Certificate.fromCertificateArn(this, 'cloud-resume-certificate', certificateArn),
    });

    // Deploy website files to S3 bucket
    new s3deploy.BucketDeployment(this, 'cloud-resume-deployment', {
      sources: [s3deploy.Source.asset('./website')],
      destinationBucket: websiteBucket,
      distribution: distribution,
      distributionPaths: ['/*']
    });

    // Create DynamoDB table
    const visitorTable = new dynamodb.Table(this, 'visitor-counter', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    // Create Lambda function
    const visitorCounter = new lambda.Function(this, 'visitor-counter-function', {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/visitor-counter'),
      environment: {
        TABLE_NAME: visitorTable.tableName
      }
    });

    // Grant Lambda permissions to DynamoDB
    visitorTable.grantReadWriteData(visitorCounter);

    // Create API Gateway
    const api = new apigateway.RestApi(this, 'visitor-counter-api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Accept']
      },
      deployOptions: {
        stageName: 'prod'
      }
    });

    // Create the /count resource
    const counterResource = api.root.addResource('count');

    // Add GET method with Lambda integration
    counterResource.addMethod('GET', new apigateway.LambdaIntegration(visitorCounter, {
      proxy: true  // Changed to true to use Lambda proxy integration
    }));

    // Output the API endpoint
    new cdk.CfnOutput(this, 'VisitorApiEndpoint', {
      value: `${api.urlForPath('/count')}`,
      description: 'Visitor Counter API Endpoint'
    });

    // Url output
    new cdk.CfnOutput(this, 'cloud-resume-url', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'Cloud Resume URL'
    });

    new cdk.CfnOutput(this, 'cloud-resume-distribution-url', {
      value: distribution.distributionDomainName,
      description: 'Cloud Resume Distribution URL'
    });
  }
}
