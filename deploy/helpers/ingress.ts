import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

export function ingressSpec(
  args: SimpleIngressArgs
): k8s.networking.v1.IngressArgs["spec"] {
  const port: any = {};
  if (typeof args.backend.service.port == "string")
    port.name = args.backend.service.port;
  else port.number = args.backend.service.port;

  return pulumi.Output.create(args.host).apply((hostOrHosts) => {
    const hosts = Array.isArray(hostOrHosts) ? hostOrHosts : [hostOrHosts];
    return {
      rules: hosts.map((host) => {
        return {
          host: host,
          http: {
            paths: [
              {
                path: args.path,
                pathType: "ImplementationSpecific",
                backend: {
                  service: {
                    name: args.backend.service.name,
                    port: port,
                  },
                },
              },
            ],
          },
        };
      }),
      tls: args.tls
        ? [
          {
            secretName: args.tls.secretName,
            hosts: hosts,
          },
        ]
        : [],
    };
  });
}

export interface SimpleIngressArgs {
  host: pulumi.Input<string | string[]>;
  path: string;
  backend: {
    service: {
      name: pulumi.Input<string>;
      port: number | string;
    };
  };
  tls?: {
    secretName: pulumi.Input<string>;
  };
}

export function ingressAnnotations(
  args: SimpleIngressAnnotations
): Record<string, string> {
  const res: Record<string, string> = {
    "kubernetes.io/ingress.class": "nginx",
  };
  if (args.backendHttps)
    res["nginx.ingress.kubernetes.io/backend-protocol"] = "HTTPS";

  if (args.backendGrpc)
    res["nginx.ingress.kubernetes.io/backend-protocol"] = "GRPC";

  if (args.sslRedirect)
    res["nginx.ingress.kubernetes.io/ssl-redirect"] = "true";

  if (args.bodySize) {
    res["nginx.ingress.kubernetes.io/proxy-body-size"] = args.bodySize;
  }

  if (args.certIssuer) {
    res["cert-manager.io/cluster-issuer"] = args.certIssuer;
  }
  return res;
}

export interface SimpleIngressAnnotations {
  backendHttps?: boolean;
  bodySize?: string;
  certIssuer?: string;
  sslRedirect?: boolean;
  backendGrpc?: boolean;
}
