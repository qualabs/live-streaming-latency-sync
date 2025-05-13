# Welcome to the CDK JavaScript project for AWS Deployment

The `cdk.json` file tells the CDK Toolkit how to execute your app. The build step is not required when using JavaScript.

Install aws cli using `npm install -g aws-cli`
Configure aws using `aws configure`

## Useful commands

* `npx cdk deploy`       deploy this stack to your default AWS account/region
* `npx cdk diff`         compare deployed stack with current state
* `npx cdk synth`        emits the synthesized CloudFormation template

## Fist time to deploy in a AWS account
If it's the first time you are going to deploy somghint using cdk in a particualr AWS account, first you must run `cdk bootstrap`

## Deploying with AWS SSO 

1. Login to the AWS access portal
2. Select the account and press `Access keys`
3. Copy the credentals:
```
export AWS_ACCESS_KEY_ID="....QXCTE"
export AWS_SECRET_ACCESS_KEY="......9SsK+U"
export AWS_SESSION_TOKEN=".....+wlC/hfrGDd3A=="
```
4. Paste the credantials in a terminal in the `infra/` folder
5. Run `cdk deploy`
