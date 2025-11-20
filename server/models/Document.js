import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  content: {
    type: String,
    default: '',
  },
});

export const Document = mongoose.model('Document', DocumentSchema);