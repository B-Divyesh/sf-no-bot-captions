import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = '2575352d61be1bf7225cf8f8b268a4678025fc58';
const repo = 'onnx-community/whisper-tiny.en';
const files = [
  'config.json', 'generation_config.json', 'preprocessor_config.json',
  'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json',
  'added_tokens.json', 'normalizer.json', 'merges.txt', 'vocab.json',
  'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx',
];
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = process.env.MODEL_DIR || join(root, 'public', 'models');

for (const file of files) {
  const output = join(destination, repo, file);
  await mkdir(dirname(output), { recursive: true });
  const response = await fetch(`https://huggingface.co/${repo}/resolve/${revision}/${file}`);
  if (!response.ok) throw new Error(`Could not download ${file}: ${response.status}`);
  await writeFile(output, Buffer.from(await response.arrayBuffer()));
  process.stdout.write(`downloaded ${file}\n`);
}
