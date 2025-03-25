import json
import boto3
import os

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def handler(event, context):
    try:
        print("Starting visitor counter function")
        
        # Use update_item with atomic counter
        response = table.update_item(
            Key={
                'id': 'visitors'
            },
            UpdateExpression='ADD #count :incr',
            ExpressionAttributeNames={
                '#count': 'count'
            },
            ExpressionAttributeValues={
                ':incr': 1
            },
            ReturnValues='UPDATED_NEW'
        )
        
        # Extract the count value and ensure it's an integer
        count = int(response['Attributes']['count'])
        print(f"Updated count: {count}")
        
        # Create the response body
        body = json.dumps({'count': count})
        print(f"Response body: {body}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': body
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({'error': str(e)})
        }