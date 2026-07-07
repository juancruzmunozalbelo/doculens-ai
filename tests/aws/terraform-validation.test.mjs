import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appDockerfileCandidates = [
  'Dockerfile',
  'Dockerfile.app',
  'Dockerfile.aws',
  'infra/aws/Dockerfile',
  'docker/app.Dockerfile',
];

async function readRequired(relativePath, purpose) {
  try {
    return await readFile(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      assert.fail(`${purpose} is missing at ${relativePath}`);
    }
    throw error;
  }
}

async function fileExists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath));
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function findExisting(paths) {
  const existing = [];
  for (const candidate of paths) {
    if (await fileExists(candidate)) {
      existing.push(candidate);
    }
  }
  return existing;
}

async function walkFiles(relativeDir) {
  const root = path.join(repoRoot, relativeDir);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      assert.fail(`AWS Terraform directory is missing at ${relativeDir}`);
    }
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

function stripHclComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)#.*$/gm, '$1')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function collectBlocks(source, kind) {
  return [...source.matchAll(new RegExp(`\\b${kind}\\s+"([^"]+)"(?:\\s+"([^"]+)")?`, 'g'))]
    .map((match) => (match[2] ? `${match[1]}.${match[2]}` : match[1]));
}

function assertIncludesAll(actual, expected, label) {
  for (const item of expected) {
    assert.equal(actual.includes(item), true, `${label} must include ${item}`);
  }
}

function variableDefault(source, variableName) {
  const match = source.match(new RegExp(`variable\\s+"${variableName}"\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  return match?.[1]?.match(/\bdefault\s*=\s*([^\n]+)/)?.[1]?.trim();
}

function numberFromAssignment(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)\\b`));
  return match ? Number(match[1]) : undefined;
}

function assertBooleanAssignment(source, name, expected) {
  assert.match(
    source,
    new RegExp(`\\b${name}\\s*=\\s*${expected}\\b`),
    `Terraform demo stack must set ${name} = ${expected}`,
  );
}

async function terraformModel() {
  const files = await walkFiles('infra/aws');
  const tfFiles = files.filter((file) => file.endsWith('.tf'));
  assert.ok(tfFiles.length > 0, 'infra/aws must contain Terraform .tf files');

  const combined = (await Promise.all(tfFiles.map(async (file) => {
    const text = await readRequired(file, `Terraform file ${file}`);
    return `\n# ${file}\n${text}`;
  }))).join('\n');
  const hcl = stripHclComments(combined);

  return {
    files,
    hcl,
    resources: collectBlocks(hcl, 'resource'),
    variables: collectBlocks(hcl, 'variable'),
    outputs: collectBlocks(hcl, 'output'),
  };
}

test('package exposes a targeted AWS demo contract command', async () => {
  const packageJson = JSON.parse(await readRequired('package.json', 'Node package manifest'));
  assert.equal(
    packageJson.scripts?.['test:aws'],
    'node --test tests/aws/terraform-validation.test.mjs',
    'package.json scripts.test:aws must run the AWS demo contract test directly',
  );
});

test('AWS app container build path packages the React UI and Node API with a health endpoint', async () => {
  const candidates = await findExisting(appDockerfileCandidates);
  assert.equal(
    candidates.length,
    1,
    `PR10 must define exactly one app container Dockerfile for AWS; expected one of ${appDockerfileCandidates.join(', ')}`,
  );

  const dockerfilePath = candidates[0];
  const dockerfile = await readRequired(dockerfilePath, 'AWS app Dockerfile');
  assert.match(dockerfile, /npm\s+run\s+build|vite\s+build/, `${dockerfilePath} must build the React UI assets`);
  assert.match(dockerfile, /src\/client|dist|build/, `${dockerfilePath} must include the React build path`);
  assert.match(dockerfile, /src\/server|scripts\/dev\.mjs|node\s+scripts\//, `${dockerfilePath} must include the Node API runtime path`);
  assert.match(dockerfile, /EXPOSE\s+\d+/, `${dockerfilePath} must expose the single app container port used by ECS and the ALB target group`);

  const { createDocuLensServer } = await import(path.join(repoRoot, 'apps/api/src/server/index.mjs'));
  const server = createDocuLensServer({
    aiProvider: 'minimax',
    databaseUrl: 'postgresql://health-user:health-pass@127.0.0.1:5432/health-db',
    jwtSecret: 'health-contract-secret-with-at-least-32-chars',
    minimax: {
      apiKey: 'health-contract-minimax-placeholder',
      baseUrl: 'https://api.minimax.io/v1',
      model: 'MiniMax-M3',
    },
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.equal(typeof address, 'object', 'health contract server must listen on an ephemeral port');
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200, 'ALB health endpoint must return HTTP 200');
    assert.deepEqual(
      await response.json(),
      { ok: true, service: 'doculens-ai', provider: 'minimax' },
      'ALB health endpoint must return the stable DocuLens health payload',
    );
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('Terraform files under infra/aws model the tiny ECS ALB RDS Secrets Manager CloudWatch stack', async () => {
  const model = await terraformModel();

  assert.equal(model.files.includes('infra/aws/README.md'), true, 'infra/aws must include deployment README instructions');
  assert.ok(model.files.some((file) => /provider|versions/.test(path.basename(file)) && file.endsWith('.tf')), 'infra/aws must include Terraform provider/version configuration');
  assert.ok(model.files.some((file) => /variables/.test(path.basename(file)) && file.endsWith('.tf')), 'infra/aws must include variables.tf');
  assert.ok(model.files.some((file) => /outputs/.test(path.basename(file)) && file.endsWith('.tf')), 'infra/aws must include outputs.tf');

  assert.equal(
    model.resources.includes('aws_ecr_repository.app') || model.variables.includes('image_uri'),
    true,
    'Terraform must define either an ECR app repository or an explicit image_uri variable contract',
  );
  assertIncludesAll(model.resources, [
    'aws_ecs_cluster.app',
    'aws_ecs_task_definition.app',
    'aws_ecs_service.app',
    'aws_lb.app',
    'aws_lb_target_group.app',
    'aws_lb_listener.http',
    'aws_db_instance.app',
    'aws_secretsmanager_secret.jwt',
    'aws_secretsmanager_secret.database',
    'aws_secretsmanager_secret.minimax',
    'aws_cloudwatch_log_group.app',
    'aws_iam_role.task_execution',
    'aws_security_group.alb',
    'aws_security_group.app',
    'aws_security_group.db',
  ], 'Terraform resources');

  assert.ok(model.outputs.includes('app_url') || model.outputs.includes('alb_url'), 'Terraform outputs must expose the public ALB application URL');
  assert.match(model.hcl, /health_check\s*\{[\s\S]*?path\s*=\s*"\/health"[\s\S]*?\}/, 'ALB target group health check must use /health');
  assert.match(model.hcl, /awslogs-group|aws_cloudwatch_log_group\.app/, 'ECS task definition must send app logs to CloudWatch');
  assert.match(model.hcl, /from_port\s*=\s*5432[\s\S]*security_groups\s*=\s*\[[^\]]*aws_security_group\.app\.id/, 'RDS security group must allow PostgreSQL only from the app service security group');
});

test('Terraform demo model keeps secrets out of state and uses bounded destroy-safe infrastructure', async () => {
  const { hcl, resources } = await terraformModel();

  assert.doesNotMatch(hcl, /\bsecret_string\b/, 'Terraform must not manage plaintext Secrets Manager secret_string values');
  assert.doesNotMatch(hcl, /aws_secretsmanager_secret_version/, 'Terraform must not create secret versions that put secret payloads in state');
  assert.match(hcl, /\bsecrets\s*=\s*\[[\s\S]*?(?:valueFrom|value_from)/, 'ECS task container must receive JWT, database, and MiniMax values through secret bindings');
  assert.match(hcl, /sensitive\s*=\s*true/, 'Terraform variables carrying external secret ARNs or credentials must be marked sensitive');

  assert.equal(resources.some((resource) => resource.startsWith('aws_nat_gateway.')), false, 'Tiny demo stack must not create NAT gateways');
  assert.match(hcl, /desired_count\s*=\s*1|variable\s+"desired_count"\s*\{[\s\S]*?default\s*=\s*1/, 'ECS service must default to one desired task');

  const taskCpu = numberFromAssignment(hcl, 'cpu') ?? Number(variableDefault(hcl, 'task_cpu'));
  const taskMemory = numberFromAssignment(hcl, 'memory') ?? Number(variableDefault(hcl, 'task_memory'));
  assert.ok(Number.isFinite(taskCpu) && taskCpu <= 512, 'Fargate task CPU must stay small for the disposable demo');
  assert.ok(Number.isFinite(taskMemory) && taskMemory <= 1024, 'Fargate task memory must stay small for the disposable demo');

  const storage = numberFromAssignment(hcl, 'allocated_storage') ?? Number(variableDefault(hcl, 'db_allocated_storage'));
  assert.ok(Number.isFinite(storage) && storage <= 20, 'RDS allocated storage must stay minimal for the disposable demo');
  assert.match(hcl, /instance_class\s*=\s*"db\.(?:t4g|t3|t2)\.micro"|variable\s+"db_instance_class"\s*\{[\s\S]*?default\s*=\s*"db\.(?:t4g|t3|t2)\.micro"/, 'RDS instance class must default to a micro instance');
  assertBooleanAssignment(hcl, 'multi_az', false);
  assertBooleanAssignment(hcl, 'deletion_protection', false);
  assertBooleanAssignment(hcl, 'skip_final_snapshot', true);
});

test('repository ignores Terraform state and AWS instructions cover validate plan apply destroy cost and production gaps', async () => {
  const gitignore = await readRequired('.gitignore', 'repository ignore rules');
  for (const pattern of ['.terraform/', '*.tfstate', '*.tfstate.*', '*.tfplan', 'crash.log', 'crash.*.log']) {
    assert.match(gitignore, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `.gitignore must ignore ${pattern}`);
  }

  const infraReadme = await readRequired('infra/aws/README.md', 'AWS infrastructure README');
  const rootReadme = await readRequired('README.md', 'root README');
  const docs = `${infraReadme}\n${rootReadme}`.toLowerCase();

  for (const phrase of [
    'terraform -chdir=infra/aws fmt -check',
    'terraform -chdir=infra/aws validate',
    'terraform -chdir=infra/aws plan',
    'terraform -chdir=infra/aws apply',
    'terraform -chdir=infra/aws destroy',
    '/health',
    'cost',
    'estimated',
    'cleanup',
  ]) {
    assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `AWS docs must cover ${phrase}`);
  }

  for (const phrase of [
    'https',
    'private subnet',
    'nat',
    'backup',
    'final snapshot',
    'waf',
    'rate limit',
    'remote state',
    'secret rotation',
  ]) {
    assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `AWS docs must call out production gap: ${phrase}`);
  }

  for (const phrase of [
    'lambda',
    's3',
    'markitdown',
    'container image',
    'timeout',
    'package size',
    'iam',
    'object size',
    'log redaction',
  ]) {
    assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `AWS docs must describe optional Lambda MarkItDown extension detail: ${phrase}`);
  }
});
