import { Hono } from 'hono'
import yaml from 'js-yaml'

type Bindings = {
  PRIMARY_BUCKET: R2Bucket;
  // i dont believe RATE_LIMITER is typed yet considering it's a new feature
  POST_VIEWS: KVNamespace,
  RATE_LIMITER: any;
}

const app = new Hono<{ Bindings: Bindings }>()


app.use('*', async (c, next) => {
  // yes, ratelimiting by user ip isn't really good practice, it's fine for my use case though
  const userIp = c.req.header('cf-connecting-ip') || ""
  
  const { success } = await c.env.RATE_LIMITER.limit({ key: userIp }) as { success: boolean }

  if (!success) return c.json({ status: 'error', message: 'Rate limit exceeded' }, 429)
  
  return next() 
})


app.get('/', (c) => {
  return c.json({ status: 'ok' }, 200)
})


app.get('/posts', async (c) => {
  const files = await c.env.PRIMARY_BUCKET.list({ prefix: "posts/", delimiter: "/" })

  if (!files.objects) return c.json({ status: 'error', message: 'No posts found' }, 404)

  const posts = await Promise.all(files.objects.map(async (file) => {
    const post = await c.env.PRIMARY_BUCKET.get(file.key)
    const contents = await post?.text()
    const [yamlSect] = contents!.split('---\n').slice(1)

    const data = yaml.load(yamlSect) as any

    const views = await c.env.POST_VIEWS.get(data.slug) || '0'

    return { title: data.title, slug: data.slug, date: data.date, description: data.description, views: null }
  }))

  return c.json({ posts }, 200)
})


app.get('/posts/:slug', async (c) => {
  const { slug } = c.req.param()

  const file = await c.env.PRIMARY_BUCKET.get("posts/test.mdx")

  if (!file) return c.json({ status: 'error', message: 'Post not found' }, 404)

  const contents = await file.text()

  const [yamlSect] = contents.split('---\n').slice(1)
  const data = yaml.load(yamlSect) as any

  // file slug != file key
  if (data.slug !== slug) return c.json({ status: 'error', message: 'Post not found' }, 404)
  
  let views = await c.env.POST_VIEWS.get(slug) || '0'

  const viewsCount = parseInt(views) + 1

  await c.env.POST_VIEWS.put(slug, viewsCount.toString())

  return c.json({ title: data.title, slug: data.slug, date: data.date, description: data.description, views: null, content: contents }, 200)
})


export default app
