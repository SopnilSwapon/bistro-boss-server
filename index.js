require('dotenv').config()
const express = require('express')
const app = express();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const jwt = require('jsonwebtoken')
const cors =  require('cors')
const port = process.env.PORT || 5000


// middleware 
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nshaxle.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

   const userCollection = client.db('bistroDB').collection('users')
   const menuCollection = client.db('bistroDB').collection('menu')
   const reviewsCollection = client.db('bistroDB').collection('reviews')
   const cartCollection = client.db('bistroDB').collection('carts')
   const paymentCollection = client.db('bistroDB').collection('payments')


  //  jwt related api //
  app.post('/jwt', async (req, res) =>{
    const user = req.body;
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: '1h'
    })
    res.send({token})
  })
  // middlewares//
  const verifyToken = (req, res, next) =>{
    if(!req.headers.authorization){
      return res.status(401).send('unauthorized access');
    }
    const token = req.headers.authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) =>{
      if(err){
        return res.status(401).send({message: 'unauthorized access'});
      }
      req.decoded = decoded;
      next();
    })

  }
  // verify token after verify token
  const verifyAdmin = async (req, res, next) =>{
    const email = req.decoded?.email;
    const query = {email: email};
    const user = await userCollection.findOne(query);
    const isAdmin = user?.Role === 'admin';
    if(!isAdmin){
      return res.status(403).send({message: 'forbidden access'})
    };
    next();
  }
   //users related api//
   app.get('/users', verifyToken, verifyAdmin, async(req, res) =>{
    const users = req.body;
    const result = await userCollection.find(users).toArray()
    res.send(result)
   })
   app.get('/user/admin/:email', verifyToken, async(req, res) =>{
    const email = req.params.email;
    if(email !== req.decoded.email){
      return res.status(403).send({message: 'forbidden access'})
    }
    const query = {email: email};
    const user = await userCollection.findOne(query);
    let admin = false;
    if(user){
     admin = user?.Role === 'admin'
    }
    res.send({admin})

   })
  app.post('/user', async(req, res) =>{
    const user = req.body;
    const result = await userCollection.insertOne(user);
    res.send(result)   
  })
  app.delete('/users/:id', verifyToken, verifyAdmin, async(req, res) =>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await userCollection.deleteOne(query)
    res.send(result)
  })
  app.patch('/users/admin/:id', verifyToken, verifyAdmin, async(req, res) =>{
    const id = req.params.id;
    const filter = {_id: new ObjectId(id)}
    const updatedDoc = {
      $set : {
        Role: 'admin'
      }
    }
    const result = await userCollection.updateOne(filter, updatedDoc);
    res.send(result)
  })
  
  // PAYMENT INTENT//
  app.post('/create-payment-intent', async(req, res) =>{
    const {price} = req.body;
    const amount = parseInt(price * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card']
    });
    res.send({
      clientSecret: paymentIntent.client_secret
    })
  });
app.post('/payments', async (req, res) =>{
  const payment = req.body;
  const paymentResult = await paymentCollection.insertOne(payment);
  const query = { _id: {
    $in: payment.cardIds.map(id => new ObjectId(id))
  }};
  const deleteResult = await cartCollection.deleteMany(query);
  res.send({paymentResult, deleteResult})
})
  
  // menu related api //
  app.post('/menu', verifyToken, verifyAdmin, async (req, res) =>{
    const item = req.body;
    const result = await menuCollection.insertOne(item);
    res.send(result);
  })
   app.get('/menu', async(req, res) =>{
    const result = await menuCollection.find().toArray();
    res.send(result)
   });
   app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) =>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await menuCollection.deleteOne(query);
    res.send(result)
   });
   app.get('/menu/:id', async(req, res) =>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)};
    const result = await menuCollection.findOne(query);
    res.send(result)
   });
   app.patch('/menu/:id', async (req, res) =>{
    const id = req.params.id;
    const filter = {_id: new ObjectId(id)};
    const newItem = req.body;
    const updatedDoc = {
      $set:{
         name: newItem.name,
         price: newItem.price,
         recipe: newItem.recipe,
         image: newItem.image,
         category: newItem.category
      }
    }
    const result = await menuCollection.updateOne(filter, updatedDoc);
    res.send(result)
   })
 
   app.get('/reviews', async(req, res) =>{
    const result = await reviewsCollection.find().toArray();
    res.send(result)
   })

  //  post food item in cartCollection //
  app.post('/carts', async(req, res) =>{
    const cartItem = req.body;
    const result = await cartCollection.insertOne(cartItem);
    res.send(result)
  });

  // get food cart //

  app.get('/carts', async(req, res)=>{
    const email = req.query.email;
    const query = {email: email}
    const result = await cartCollection.find(query).toArray();
    res.send(result)
  });
  app.delete('/carts/:id', async(req, res) =>{
    const id = req.params.id
    const query = {_id: new ObjectId (id)}
    const result = await cartCollection.deleteOne(query)
    res.send(result)
  })


    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) =>{
    res.send('boss is sitting')
})

app.listen(port, ()=>{
console.log(`bistro boss is sitting on port${port}`);
})