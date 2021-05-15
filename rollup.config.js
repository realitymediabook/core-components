import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
    input: 'src/rooms/index.js',
    output: {
        file: './build/main.js',
        format: 'es',
        sourcemap: 'inline'
    },
    plugins: [nodeResolve()]
};