import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import type { Construct } from "constructs";

const org = "fxd"; // Organization Name
const environment = "dev"; // Environment

export interface EcsStackProps extends cdk.StackProps {
  vpc: ec2.IVpc; // Use IVpc for flexibility
}

export class EcsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);

    const vpc = props.vpc;

    // ✅ Use an existing ECR repository instead of creating a new one
    const ecrRepositoryUri =
      "361769583226.dkr.ecr.us-east-1.amazonaws.com/fdx-dev-app-repo";

    // ✅ Create an S3 bucket to store environment variables
    const envBucket = new s3.Bucket(this, `${org}-${environment}-env-bucket`, {
      bucketName: `${org}-${environment}-env-bucket`,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Change this in production
      autoDeleteObjects: true, // Enable object deletion when stack is removed
    });

    const executionRole = new iam.Role(
      this,
      `${org}-${environment}-ecs-execution-role`,
      {
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
        description:
          "ECS Task Execution Role to allow access to ECR and other AWS services",
      }
    );

    // Attach the default ECS execution policy
    executionRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AmazonECSTaskExecutionRolePolicy"
      )
    );

    // If you need access to S3 for env variables, attach an additional policy
    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${envBucket.bucketArn}/*`], // Allow ECS to read environment files from S3
      })
    );

    // ✅ Create an ECS Cluster
    const ecsCluster = new ecs.Cluster(this, `${org}-${environment}-cluster`, {
      vpc,
      clusterName: `${org}-${environment}-ecs-cluster`,
    });

    // ✅ Security Group for ECS tasks
    const ecsSecurityGroup = new ec2.SecurityGroup(
      this,
      `${org}-${environment}-ecs-sg`,
      {
        vpc,
        description: "Allow HTTP/HTTPS traffic to ECS service",
        allowAllOutbound: true, // ✅ Allow outbound traffic
      }
    );

    // Allow incoming HTTP and HTTPS traffic
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic"
    );

    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic"
    );
    ecsSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      "Allow Django traffic"
    ); // Open Django default port

    // ✅ Security Group for Load Balancer
    const lbSecurityGroup = new ec2.SecurityGroup(
      this,
      `${org}-${environment}-alb-sg`,
      {
        vpc,
        description: "Allow HTTP/HTTPS traffic to Load Balancer",
        allowAllOutbound: true,
      }
    );

    // Allow inbound HTTP (80) and HTTPS (443)
    lbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP traffic to Load Balancer"
    );

    lbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      "Allow HTTPS traffic to Load Balancer"
    );

    lbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8000),
      "Allow inbound HTTP traffic on port 8000"
    ); // ✅ Ensure port 8000 is open on LB

    // ✅ Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${org}-${environment}-task`,
      {
        memoryLimitMiB: 512,
        cpu: 256,
        executionRole: executionRole, // ✅ Attach the role
      }
    );

    // ✅ Reference the existing ECR repo image
    const container = taskDefinition.addContainer(`${org}-app-container`, {
      image: ecs.ContainerImage.fromRegistry(`${ecrRepositoryUri}:latest`), // ✅ Use existing ECR image
      logging: ecs.LogDriver.awsLogs({ streamPrefix: `${org}-logs` }),
      environment: {
        ENV_S3_BUCKET: envBucket.bucketName, // Pass S3 bucket name to the container
      },
    });

    container.addPortMappings({
      containerPort: 8000, // Django default port
    });

    // ✅ Create an ECS Fargate service with an ALB
    const fargateService =
      new ecs_patterns.ApplicationLoadBalancedFargateService(
        this,
        `${org}-${environment}-ecs-service`,
        {
          cluster: ecsCluster,
          taskDefinition,
          securityGroups: [ecsSecurityGroup],
          publicLoadBalancer: true,
          assignPublicIp: true, // ✅ Ensures ECS tasks get public IPs
        }
      );

    // ✅ Attach the LB security group
    fargateService.loadBalancer.addSecurityGroup(lbSecurityGroup);

    // ✅ Configure health check
    fargateService.targetGroup.configureHealthCheck({
      path: "/",
      port: "8000",
    });

    // ✅ Grant ECS task access to the S3 bucket
    envBucket.grantRead(taskDefinition.taskRole);
  }
}
