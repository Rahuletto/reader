interface CloudflareBindings {
  CACHE: KVNamespace;
}

type WorkerEnv = { Bindings: CloudflareBindings };
