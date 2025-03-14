import * as cdk from "aws-cdk-lib";
import { VpcStack } from "../lib/vpc-stack";
import { EcsStack } from "../lib/ecs-stack";
import { RdsStack } from "../lib/rds-stack";
import { App } from "aws-cdk-lib";
import { AmplifyStack } from "../lib/amplify-stack";

const app = new cdk.App();

const vpcStack = new VpcStack(app, "VpcStack");

const ecsStack = new EcsStack(app, "EcsStack", {
  vpc: vpcStack.vpc,
});

const rdsStack = new RdsStack(app, "RdsStack", {
  vpc: vpcStack.vpc,
});

const amplifyStack = new AmplifyStack(app, "AmplifyStack", {
  owner: "Tochi-Nwachukwu",
  repository: "fxd-fe",
  githubOauthTokenName: "ghub-token",
});

app.synth();
