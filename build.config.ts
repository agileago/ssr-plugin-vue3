import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    {
      builder: 'mkdist',
      format: 'cjs',
      input: './src',
      outDir: './cjs',
    },
    {
      builder: 'mkdist',
      format: 'esm',
      input: './src',
      ext: 'js',
      outDir: './esm',
    },
  ],
  declaration: true,
  clean: true,
})
