import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import type { Construct } from "constructs";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const org = "fxd";
const environment = "dev";

export interface RdsStackProps extends cdk.StackProps {
  vpc: ec2.Vpc;
}

export class RdsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RdsStackProps) {
    super(scope, id, props);

    const { vpc } = props;

    // ✅ Load credentials from .env file
    const databaseUsername = process.env.DB_USERNAME || "postgres";
    const databasePassword = process.env.DB_PASSWORD || "default";

    // ✅ Create a Security Group for the RDS Database
    const dbSecurityGroup = new ec2.SecurityGroup(
      this,
      `${org}-db-sg-${environment}`,
      {
        vpc,
        securityGroupName: `${org}-db-sg-${environment}`,
        description: "Security group for PostgreSQL RDS in private subnet",
        allowAllOutbound: true,
      }
    );

    dbSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(), // Restrict this in production
      ec2.Port.tcp(5432),
      "Allow PostgreSQL access from ECS"
    );

    // ✅ Create the RDS PostgreSQL Database
    const dbInstance = new rds.DatabaseInstance(
      this,
      `${org}-postgres-${environment}`,
      {
        engine: rds.DatabaseInstanceEngine.postgres({
          version: rds.PostgresEngineVersion.VER_14,
        }),
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE3,
          ec2.InstanceSize.MEDIUM
        ),
        vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        allocatedStorage: 20,
        maxAllocatedStorage: 100,
        securityGroups: [dbSecurityGroup],
        deleteAutomatedBackups: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
        databaseName: "flexxydrive",

        // ✅ Use credentials from environment variables
        credentials: rds.Credentials.fromPassword(
          databaseUsername,
          cdk.SecretValue.unsafePlainText(databasePassword)
        ),
      }
    );

    // ✅ Output database connection details (excluding password for security)
    new cdk.CfnOutput(this, "DatabaseEndpoint", {
      value: dbInstance.dbInstanceEndpointAddress,
    });
  }
}