import jwt from 'jsonwebtoken';

// Function to generate a token for a user (expires in 24 hours)
export const generateToken = (userId) => {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });
  return token;
};