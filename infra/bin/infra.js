const cdk = require('aws-cdk-lib');
const ec2 = require('aws-cdk-lib/aws-ec2');
const ecs = require('aws-cdk-lib/aws-ecs');
const ecsPatterns = require('aws-cdk-lib/aws-ecs-patterns');
const ecr = require('aws-cdk-lib/aws-ecr');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');

class FargateServiceStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);

        // Create the VPC
        const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2 });

        // Create the ECS cluster
        const cluster = new ecs.Cluster(this, "Cluster", { vpc });

        // Create a repository in ECR
        const repository = new ecr.Repository(this, "EcrRepo");

        // Create Fargate Service with a Docker image from a local directory
        const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
            cluster,
            cpu: 512,
            memoryLimitMiB: 1024,
            desiredCount: 1,
            taskImageOptions: {
              image: ecs.ContainerImage.fromAsset("../", {  // Build and upload the image to ECR automatically.
                repository
              }),                
              containerPort: 3000
            },
            publicLoadBalancer: true // Expose to the Internet
        });

        // Configure the listener on port 3000.
        fargateService.targetGroup.configureHealthCheck({ port: "3000", path: "/health" });

        // Create CloudFront to improve performance and security using the Load Balancer as the origin.
        const distribution = new cloudfront.Distribution(this, "CloudFront", {
          defaultBehavior: {
              origin: new origins.LoadBalancerV2Origin(fargateService.loadBalancer, {
                  protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY
              }),
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
              allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
          }
        });

        // Print the service access URL with HTTPS.
        new cdk.CfnOutput(this, "ServiceURL", { value: `https://${distribution.distributionDomainName}` });
    }
}

const app = new cdk.App();
// If needed, Change teh Stack name to something more meaningful.
new FargateServiceStack(app, "globalSyncServerStack");
app.synth();
