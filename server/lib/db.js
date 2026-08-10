import mongoose from "mongoose"

// Function to connect to the mongoose
export const connectDB = async () =>{
    try{
        mongoose.connection.on('connected', ()=> console.log('Database Connected'));
        await mongoose.connect(process.env.MONGODB_URI)
    }catch (error){
        console.log(error);
        
    }
}