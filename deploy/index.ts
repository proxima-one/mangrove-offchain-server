import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as helpers from "./helpers";
import { strict as assert } from "assert";

const cfg = new pulumi.Config();
const proximaNode = cfg.require<string>("proxima-node");

const infraStack = new pulumi.StackReference(`proxima-one/proxima-gke/${proximaNode}`, {});
const kubeconfig = infraStack.getOutput("kubeconfig");
const k8sProvider = new k8s.Provider("infra-k8s", {
  kubeconfig: kubeconfig,
});

const dbSchema = "mangrove6";
export const publicHost = `mangrove-api.cluster.${proximaNode}.proxima.one`;

const servicesStack = new pulumi.StackReference(`proxima-one/${proximaNode}-services/default`, {});
const webServicesHostOptions = servicesStack.requireOutput("webServices") as pulumi.Output<{namespace: string, imagePullSecret: string, postgres: string}>;
const databaseUrl = webServicesHostOptions.postgres.apply(x => `${x}?schema=${dbSchema}`);

const imageName = process.env["IMAGE_NAME"];
assert(imageName);

const labels: Record<string, string> = {
  app: "mangrove-offchain-server",
};

const deployment = new k8s.apps.v1.Deployment("mangrove-api", {
  metadata: {
    namespace: webServicesHostOptions.namespace,
  },
  spec: {
    replicas: 1,
    selector: {
      matchLabels: labels
    },
    template: {
      metadata: {
        labels: labels,
      },
      spec: {
        restartPolicy: "Always",
        imagePullSecrets: [{
          name: webServicesHostOptions.imagePullSecret
        }],
        containers: [{
          image: imageName,
          name: "api",
          args: [
            "server"
          ],
          env: [
            {
              name: "DATABASE_URL",
              value: databaseUrl
            },
            {
              name: "PORT",
              value: "80"
            },
          ],
          ports: [
            {
              containerPort: 80
            }
          ],
          resources: {
            requests: {
              memory: "100Mi",
              cpu: "50m",
            },
            limits: {
              memory: "1000Mi",
              cpu: "1000m",
            }
          }
        }],
      }
    },
  }
}, {provider: k8sProvider});

const consumerLabels: Record<string, string> = {
  app: "mangrove-offchain-server-consumer",
};
const deploymentConsumer = new k8s.apps.v1.Deployment("mangrove-consumer", {
  metadata: {
    namespace: webServicesHostOptions.namespace,
  },
  spec: {
    selector: {
      matchLabels: consumerLabels
    },
    template: {
      metadata: {
        labels: consumerLabels
      },
      spec: {
        restartPolicy: "Always",
        imagePullSecrets: [{
          name: webServicesHostOptions.imagePullSecret
        }],
        containers: [{
          image: imageName,
          name: "consumer",
          args: [
            "consumer"
          ],
          env: [
            {
              name: "DATABASE_URL",
              value: databaseUrl
            },
            {
              name: "BATCH_SIZE",
              value: "50"
            },
            {
              name: "MIGRATE_DB",
              value: "1"
            }
          ],
          resources: {
            requests: {
              memory: "500Mi",
              cpu: "200m",
            },
            limits: {
              memory: "2000Mi",
              cpu: "1200m",
            }
          }
        }],
      }
    },
  }
}, {provider: k8sProvider});

const service = new k8s.core.v1.Service("mangrove", {
  metadata: {
    namespace: webServicesHostOptions.namespace,
  },
  spec: {
    selector: labels,
    ports: [
      {
        name: "http",
        protocol: "TCP",
        port: 80,
        targetPort: 80
      }
    ],
  }
}, {dependsOn: deployment, provider: k8sProvider});

if (publicHost) {
  const ingress = new k8s.networking.v1.Ingress(
    `mangrove-api-ingress`,
    {
      metadata: {
        namespace: webServicesHostOptions.namespace,
        annotations: helpers.ingressAnnotations({
          certIssuer: "letsencrypt",
          sslRedirect: true,
        }),
      },
      spec: helpers.ingressSpec({
        host: publicHost,
        path: "/",
        backend: {
          service: {
            name: service.metadata.name,
            port: 80,
          },
        },
        tls: {
          secretName: service.metadata.name.apply((x) => `${x}-tls`),
        },
      }),
    },
    {provider: k8sProvider}
  );
}
