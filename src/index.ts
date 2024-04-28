import { Hono } from 'hono'

type Bindings = {
    bucket: R2Bucket;
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => {
  return c.json({ status: 'ok' }, 200)
})

app.get('/posts/:slug', (c) => {
  const { slug } = c.req.param()

  console.log(c.env)

  const files = c.env.bucket.list({ delimiter: '/' })

  const testFile = c.env.bucket.get('posts/test.mdx')

  return c.json({ slug, files, testFile }, 200)
})

export default app
