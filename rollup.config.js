import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from "rollup-plugin-terser";

export default {
    input: 'src/rooms/index.js',
    output: [{
        file: './build/main.js',
        format: 'es',
        sourcemap: 'inline'
    },
    {
        file: './build/main.min.js',
        format: 'es',
        plugins: [terser()]
    }],
    plugins: [nodeResolve()]
};